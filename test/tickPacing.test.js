'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { buildConfig } = require('../src/config/worldConfig');
const { createWorld } = require('../src/world/world');

test('development and production defaults use different wall-clock pacing', () => {
  const previousMode = process.env.NODE_ENV;
  const previousInterval = process.env.SIM_TICK_MS;
  try {
    delete process.env.SIM_TICK_MS;
    process.env.NODE_ENV = 'development';
    assert.equal(buildConfig().simulation.tickMs, 10000);
    process.env.NODE_ENV = 'production';
    assert.equal(buildConfig().simulation.tickMs, 20000);
    assert.equal(buildConfig().simulation.ticksPerDay, 360);
  } finally {
    if (previousMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousMode;
    if (previousInterval === undefined) delete process.env.SIM_TICK_MS;
    else process.env.SIM_TICK_MS = previousInterval;
  }
});

function withTick(config, tickMs) {
  return { ...config, simulation: { ...config.simulation, tickMs } };
}

function historicHash(config) {
  const { terrainCacheMaxChunks, ...durableConfig } = config;
  return crypto.createHash('sha256').update(JSON.stringify(durableConfig)).digest('hex');
}

function makeHistoricSnapshot(directory, config) {
  const world = createWorld({ config, snapshotDir: directory, autoStart: false });
  world.simulation.tick();
  world.saveSnapshot();
  const worldId = world.simulation.getStatus().worldId;
  const firstAgent = { ...world.agents.listAll()[0] };
  world.stop();
  const file = path.join(directory, 'world.json');
  const document = JSON.parse(fs.readFileSync(file, 'utf8'));
  document.configHash = historicHash(config);
  delete document.configHashVersion;
  fs.writeFileSync(file, JSON.stringify(document));
  return { worldId, firstAgent };
}

test('a 10-second historic snapshot resumes at 20 seconds, then 30 seconds', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tick-pace-'));
  const base = buildConfig();
  const small = { ...base, width: 128, height: 128,
    agents: { ...base.agents, count: 1 } };
  const oldConfig = withTick(small, 10000);
  const productionConfig = withTick(small, 20000);
  try {
    const { worldId, firstAgent } = makeHistoricSnapshot(directory, oldConfig);
    const restored = createWorld({ config: productionConfig, snapshotDir: directory, autoStart: false });
    assert.equal(restored.simulation.getStatus().tickCount, 1);
    assert.equal(restored.simulation.getStatus().tickMs, 20000);
    assert.equal(restored.simulation.getStatus().worldId, worldId);
    assert.equal(restored.agents.listAll()[0].id, firstAgent.id);
    restored.simulation.tick();
    restored.saveSnapshot();
    restored.stop();

    const upgraded = JSON.parse(fs.readFileSync(path.join(directory, 'world.json'), 'utf8'));
    assert.equal(upgraded.configHashVersion, 2);
    const changedAgain = createWorld({ config: withTick(small, 30000),
      snapshotDir: directory, autoStart: false });
    assert.equal(changedAgain.simulation.getStatus().tickCount, 2);
    assert.equal(changedAgain.simulation.getStatus().worldId, worldId);
    changedAgain.stop();

    assert.throws(() => createWorld({ config: { ...productionConfig, seed: base.seed + 1 },
      snapshotDir: directory, autoStart: false }), /configuration mismatch/);
    assert.throws(() => createWorld({ config: { ...productionConfig,
      simulation: { ...productionConfig.simulation, ticksPerDay: 180 } },
    snapshotDir: directory, autoStart: false }), /configuration mismatch/);

    // The first post-upgrade save leaves the historic snapshot as backup.
    // Recovery must still work after the pacing value changes again.
    fs.writeFileSync(path.join(directory, 'world.json'), '{broken');
    const recovered = createWorld({ config: withTick(small, 30000),
      snapshotDir: directory, autoStart: false });
    assert.equal(recovered.simulation.getStatus().tickCount, 1);
    assert.equal(recovered.simulation.getStatus().worldId, worldId);
    recovered.stop();
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('a custom previous tick interval needs an explicit migration setting', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'custom-tick-pace-'));
  const base = buildConfig();
  const small = { ...base, width: 128, height: 128,
    agents: { ...base.agents, count: 1 } };
  const originalSetting = process.env.SNAPSHOT_PREVIOUS_TICK_MS;
  try {
    makeHistoricSnapshot(directory, withTick(small, 750));
    assert.throws(() => createWorld({ config: withTick(small, 20000),
      snapshotDir: directory, autoStart: false }), /configuration mismatch/);
    process.env.SNAPSHOT_PREVIOUS_TICK_MS = '750';
    const restored = createWorld({ config: withTick(small, 20000),
      snapshotDir: directory, autoStart: false });
    assert.equal(restored.simulation.getStatus().tickCount, 1);
    restored.stop();
  } finally {
    if (originalSetting === undefined) delete process.env.SNAPSHOT_PREVIOUS_TICK_MS;
    else process.env.SNAPSHOT_PREVIOUS_TICK_MS = originalSetting;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
