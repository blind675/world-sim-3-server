'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildConfig } = require('../src/config/worldConfig');
const { createWorld } = require('../src/world/world');

function smallConfig() {
  const base = buildConfig();
  return { ...base, width: 128, height: 128, chunkSize: 32,
    agents: { ...base.agents, count: 3 }, simulation: { tickMs: 100000 } };
}

test('reset replaces live state and both durable copies with a fresh world', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'world-reset-'));
  try {
    const config = smallConfig();
    const old = createWorld({ config, snapshotDir: dir, autoStart: false });
    old.simulation.tick();
    old.deaths.addDeath('test-agent', 1, 'test');
    old.agents.listAll()[0].hunger = 0.9;
    old.saveSnapshot();
    const oldId = old.simulation.getStatus().worldId;

    const fresh = createWorld({ config, snapshotDir: dir, autoStart: false, resetSnapshot: true });
    assert.notEqual(fresh.simulation.getStatus().worldId, oldId);
    assert.equal(fresh.simulation.getStatus().tickCount, 0);
    assert.equal(fresh.simulation.getStatus().deathCount, 0);
    assert.deepEqual(fresh.deaths.getAll(), []);
    assert.equal(fresh.agents.listAll().length, 3);
    assert.ok(fresh.agents.listAll().every(agent => agent.hunger < 0.9));
    const agent = fresh.agents.listAll()[0];
    assert.ok(fresh.chunkIndex.getChunkFromWorld(agent.x, agent.y).agentIds.includes(agent.id));
    assert.equal(fs.existsSync(path.join(dir, 'world.json.reset')), false);

    fs.writeFileSync(path.join(dir, 'world.json'), '{corrupt');
    const restored = createWorld({ config, snapshotDir: dir, autoStart: false });
    assert.equal(restored.simulation.getStatus().worldId, fresh.simulation.getStatus().worldId);
    assert.equal(restored.simulation.getStatus().tickCount, 0);
    assert.deepEqual(restored.deaths.getAll(), []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('interrupted reset finishes from its marker and never restores the old world', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'world-reset-recovery-'));
  try {
    const config = smallConfig();
    const old = createWorld({ config, snapshotDir: dir, autoStart: false });
    old.simulation.tick();
    old.saveSnapshot();
    const oldDocument = fs.readFileSync(path.join(dir, 'world.json'));
    const fresh = createWorld({ config, snapshotDir: dir, autoStart: false, resetSnapshot: true });
    const freshDocument = fs.readFileSync(path.join(dir, 'world.json'));
    fs.writeFileSync(path.join(dir, 'world.json'), oldDocument);
    fs.writeFileSync(path.join(dir, 'world.json.bak'), oldDocument);
    fs.writeFileSync(path.join(dir, 'world.json.reset'), freshDocument);

    const restored = createWorld({ config, snapshotDir: dir, autoStart: false });
    assert.equal(restored.simulation.getStatus().worldId, fresh.simulation.getStatus().worldId);
    assert.equal(restored.simulation.getStatus().tickCount, 0);
    assert.equal(fs.existsSync(path.join(dir, 'world.json.reset')), false);
    assert.deepEqual(fs.readFileSync(path.join(dir, 'world.json')), fs.readFileSync(path.join(dir, 'world.json.bak')));

    fs.writeFileSync(path.join(dir, 'world.json.reset'), '{corrupt');
    assert.throws(() => createWorld({ config, snapshotDir: dir, autoStart: false }), /Pending world reset is corrupt/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
