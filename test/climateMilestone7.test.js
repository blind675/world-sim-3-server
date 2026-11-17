'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildConfig } = require('../src/config/worldConfig');
const { createWorld } = require('../src/world/world');
const { weatherAt, temperatureAt, thermalMultipliers } = require('../src/world/climate');
const { effectiveVisionRange } = require('../src/world/rhythm');
const { decayNeeds } = require('../src/world/needs');

test('temperature follows the saved clock and local elevation', () => {
  const config = buildConfig();
  const sea = config.terrain.seaLevel;
  assert.equal(temperatureAt(config, sea, 0), 17);
  assert.equal(temperatureAt(config, sea, 180), 27);
  assert.equal(temperatureAt(config, sea, 360), 17);
  assert.ok(Math.abs(temperatureAt(config, sea + 50, 180) - 23) < 1e-9);
});

test('only cold raises hunger and only heat raises thirst, with bounded effects', () => {
  const config = buildConfig();
  assert.deepEqual(thermalMultipliers(22), { hunger: 1, thirst: 1 });
  assert.deepEqual(thermalMultipliers(-50), { hunger: 1.2, thirst: 1 });
  assert.deepEqual(thermalMultipliers(100), { hunger: 1, thirst: 1.2 });
  const normal = { hunger: 0, thirst: 0, tiredness: 0 };
  const cold = { ...normal };
  const hot = { ...normal };
  decayNeeds(normal, config, 22);
  decayNeeds(cold, config, 5);
  decayNeeds(hot, config, 35);
  assert.ok(cold.hunger > normal.hunger);
  assert.equal(cold.thirst, normal.thirst);
  assert.ok(hot.thirst > normal.thirst);
  assert.equal(hot.hunger, normal.hunger);
});

test('seeded daily weather changes temperature and rain shortens sight', () => {
  const config = buildConfig();
  const sea = config.terrain.seaLevel;
  assert.equal(weatherAt(config, 0).type, 'clear');
  assert.equal(weatherAt(config, 1080).type, 'heatwave');
  assert.equal(weatherAt(config, 2160).type, 'rain');
  assert.deepEqual(weatherAt(config, 2160), weatherAt(config, 2519));
  const shorterDay = { ...config, simulation: { ...config.simulation, ticksPerDay: 120 } };
  assert.deepEqual(weatherAt(shorterDay, 119), weatherAt(shorterDay, 0));
  assert.deepEqual(weatherAt(shorterDay, 120), weatherAt(config, 360));
  assert.equal(temperatureAt(config, sea, 1080 + 180) - temperatureAt(config, sea, 180), 5);
  assert.equal(temperatureAt(config, sea, 2160 + 180) - temperatureAt(config, sea, 180), -2);
  const agent = { traits: { visionRange: 20, circadianType: 'diurnal' }, tiredness: 0 };
  assert.equal(effectiveVisionRange(agent, config, 180), 20);
  assert.equal(effectiveVisionRange(agent, config, 2160 + 180), 17);
});

test('a cold-front world applies the local hunger cost in its real tick loop', () => {
  const base = buildConfig();
  const config = { ...base, seed: 20260402, width: 128, height: 128,
    agents: { ...base.agents, count: 1 } };
  const world = createWorld({ config, snapshotDir: null, autoStart: false });
  const agent = world.agents.listAll()[0];
  assert.equal(world.simulation.getStatus().weather, 'cold_front');
  const temperatureC = temperatureAt(config, world.terrain.cellAt(agent.x, agent.y).height, 1);
  assert.ok(temperatureC < 15);
  world.simulation.tick();
  assert.equal(agent.hunger, config.survival.hungerDecayRate * thermalMultipliers(temperatureC).hunger);
  assert.ok(agent.hunger > config.survival.hungerDecayRate);
  world.stop();
});

test('weather transition replays exactly after restore and old snapshots upgrade safely', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'climate-world-'));
  try {
    const base = buildConfig();
    const config = { ...base, seed: 20260421, width: 128, height: 128,
      agents: { ...base.agents, count: 2 } };
    const world = createWorld({ config, snapshotDir: dir, autoStart: false });
    world.simulation.restore({ ...world.simulation.snapshot(), tickCount: 718 });
    world.simulation.tick();
    world.saveSnapshot();
    const restored = createWorld({ config, snapshotDir: dir, autoStart: false });
    assert.equal(restored.simulation.getStatus().weather, 'clear');
    for (let i = 0; i < 8; i++) {
      world.simulation.tick();
      restored.simulation.tick();
      assert.deepEqual(restored.snapshotState(), world.snapshotState());
    }
    assert.equal(restored.simulation.getStatus().weather, 'rain');
    const primary = path.join(dir, 'world.json');
    const document = JSON.parse(fs.readFileSync(primary, 'utf8'));
    delete document.climateModelVersion;
    fs.writeFileSync(primary, JSON.stringify(document));
    assert.equal(createWorld({ config, snapshotDir: dir, autoStart: false })
      .simulation.getStatus().tickCount, document.state.simulation.tickCount);
    document.climateModelVersion = 2;
    fs.writeFileSync(primary, JSON.stringify(document));
    assert.throws(() => createWorld({ config, snapshotDir: dir, autoStart: false }),
      /climate model version 2 is incompatible/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
