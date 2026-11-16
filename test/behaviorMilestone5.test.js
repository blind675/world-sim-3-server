'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { buildConfig } = require('../src/config/worldConfig');
const { createWorld } = require('../src/world/world');
const { createBehaviorScheduler } = require('../src/world/behaviorScheduler');
const { loadBehaviorCatalog, validateBehaviorCatalog, DEFAULT_PATH } = require('../src/world/behaviorCatalog');

function smallConfig() {
  const base = buildConfig();
  return { ...base, width: 128, height: 128, chunkSize: 32,
    agents: { ...base.agents, count: 1 },
    simulation: { ...base.simulation, tickMs: 100000 } };
}

test('behavior catalogue rejects unbounded or unknown actions before startup', () => {
  const original = JSON.parse(fs.readFileSync(DEFAULT_PATH, 'utf8'));
  assert.equal(validateBehaviorCatalog(original).definitions.length, 6);
  const changed = (id, patch) => ({ ...original, definitions: original.definitions.map(def =>
    def.id === id ? { ...def, ...patch } : def) });
  assert.throws(() => validateBehaviorCatalog(changed('idle', { steps: [{ action: 'eval', ticks: 1 }] })), /sequence/);
  assert.throws(() => validateBehaviorCatalog(changed('look_around', { steps: [{ action: 'stay', ticks: 200 }] })), /sequence/);
  assert.throws(() => validateBehaviorCatalog(changed('seek_water', { algorithm: 'random' })), /survival/);
  assert.throws(() => validateBehaviorCatalog(changed('idle', { script: 'run arbitrary code' })), /Unknown behavior setting/);
});

test('each stay or turn step consumes exactly one tick and cooldown prevents immediate repeat', () => {
  const catalog = loadBehaviorCatalog();
  const scheduler = createBehaviorScheduler(catalog, () => 0);
  const agent = { facing: 0, state: 'idle', currentAction: null, hunger: 0,
    thirst: 0, tiredness: 0, behaviorState: null, behaviorCooldowns: {} };
  scheduler.start(agent, 'look_around', 1);
  const actions = [];
  for (let tick = 1; tick <= 20; tick++) {
    assert.equal(scheduler.tickSequence(agent, tick), true);
    actions.push(agent.currentAction);
  }
  assert.equal(actions.filter(action => action === 'stay').length, 16);
  assert.equal(actions.filter(action => action === 'turn_right').length, 4);
  assert.equal(agent.facing, 0);
  assert.equal(agent.behaviorState, null);
  assert.equal(agent.behaviorCooldowns.look_around, 50);
  assert.equal(scheduler.selectLeisure(agent, 21).id, 'idle');
  scheduler.start(agent, 'explore', 51);
  assert.equal(scheduler.timedOut(agent, 410), false);
  assert.equal(scheduler.timedOut(agent, 411), true);
});

test('urgent thirst interrupts a leisure sequence on the next tick', () => {
  const config = smallConfig();
  const world = createWorld({ config, snapshotDir: null, autoStart: false });
  const agent = world.agents.listAll()[0];
  agent.behaviorState = { id: 'look_around', startedTick: 0, stepIndex: 0, stepTicksLeft: 4 };
  agent.thirst = config.survival.thirstThreshold;
  world.simulation.tick();
  assert.equal(agent.behaviorState?.id, 'seek_water');
  assert.equal(agent.currentGoal?.type, 'seek_water');
  assert.equal(agent.behaviorCooldowns.look_around, 31);
});

test('urgent hunger replaces an active exploration route and releases its budget', () => {
  const config = smallConfig();
  const world = createWorld({ config, snapshotDir: null, autoStart: false });
  const agent = world.agents.listAll()[0];
  agent.behaviorState = { id: 'explore', startedTick: 0, stepIndex: 0, stepTicksLeft: 0 };
  agent.currentGoal = { type: 'wander', targetX: agent.x, targetY: agent.y };
  world.agents.setPath(agent, [{ x: agent.x, y: agent.y }]);
  agent.hunger = config.survival.hungerThreshold;
  world.simulation.tick();
  assert.equal(agent.behaviorState?.id, 'seek_food');
  assert.equal(agent.currentGoal?.type, 'seek_food');
  assert.equal(agent.behaviorCooldowns.explore, 1);
});

test('a saved behavior resumes the same actions and random choices after restore', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-replay-'));
  try {
    const config = smallConfig();
    const world = createWorld({ config, snapshotDir: dir, autoStart: false });
    const agent = world.agents.listAll()[0];
    agent.behaviorState = { id: 'look_around', startedTick: 0, stepIndex: 0, stepTicksLeft: 4 };
    for (let i = 0; i < 7; i++) world.simulation.tick();
    world.saveSnapshot();
    const restored = createWorld({ config, snapshotDir: dir, autoStart: false });
    assert.deepEqual(restored.agents.listAll()[0].behaviorState, agent.behaviorState);
    for (let i = 0; i < 40; i++) {
      world.simulation.tick();
      restored.simulation.tick();
      assert.deepEqual(restored.snapshotState(), world.snapshotState());
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('old snapshots upgrade only with the built-in behavior catalogue', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'behavior-upgrade-'));
  try {
    const config = smallConfig();
    const world = createWorld({ config, snapshotDir: dir, autoStart: false });
    world.simulation.tick();
    world.saveSnapshot();
    const primary = path.join(dir, 'world.json');
    const document = JSON.parse(fs.readFileSync(primary, 'utf8'));
    const custom = JSON.parse(fs.readFileSync(DEFAULT_PATH, 'utf8'));
    custom.revision++;
    const customPath = path.join(dir, 'custom.json');
    fs.writeFileSync(customPath, JSON.stringify(custom));
    assert.throws(() => createWorld({ config, snapshotDir: dir,
      behaviorCatalogPath: customPath, autoStart: false }), /behavior catalogue mismatch/);
    delete document.behaviorHash;
    for (const agent of document.state.agents) {
      delete agent.behaviorState;
      delete agent.behaviorCooldowns;
    }
    document.checksum = crypto.createHash('sha256').update(JSON.stringify(document.state)).digest('hex');
    fs.writeFileSync(primary, JSON.stringify(document));
    const restored = createWorld({ config, snapshotDir: dir, autoStart: false });
    assert.equal(restored.simulation.getStatus().tickCount, 1);
    assert.equal(restored.agents.listAll()[0].behaviorState, null);
    assert.deepEqual(restored.agents.listAll()[0].behaviorCooldowns, {});
    assert.throws(() => createWorld({ config, snapshotDir: dir,
      behaviorCatalogPath: customPath, autoStart: false }), /legacy snapshot requires/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
