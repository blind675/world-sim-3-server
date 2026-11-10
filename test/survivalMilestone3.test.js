'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildConfig } = require('../src/config/worldConfig');
const { createWorld } = require('../src/world/world');
const { clockAt } = require('../src/world/clock');
const { canDrinkAt, shoreCandidates } = require('../src/world/water');
const { beginActionIfArrived, tickAction, decayNeeds } = require('../src/world/needs');
const { wrap } = require('../src/utils/wrap');

test('360 ticks form a day and the clock continues across a snapshot', () => {
  assert.deepEqual(clockAt(360), { day: 2, tickOfDay: 0, ticksPerDay: 360, hour: 0, minute: 0 });
  assert.deepEqual(clockAt(180), { day: 1, tickOfDay: 180, ticksPerDay: 360, hour: 12, minute: 0 });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clock-world-'));
  const base = buildConfig();
  const config = { ...base, width: 128, height: 128, agents: { ...base.agents, count: 1 } };
  try {
    const world = createWorld({ config, snapshotDir: dir, autoStart: false });
    for (let i = 0; i < 360; i++) world.simulation.tick();
    world.saveSnapshot();
    const restored = createWorld({ config, snapshotDir: dir, autoStart: false });
    assert.equal(restored.simulation.getStatus().clock.day, 2);
    assert.equal(restored.simulation.getStatus().clock.tickOfDay, 0);
    restored.stop();
    world.stop();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('agents drink beside terrain water and rest without an object', () => {
  const base = buildConfig();
  const config = { ...base, width: 128, height: 128, agents: { ...base.agents, count: 0 } };
  const world = createWorld({ config, snapshotDir: null, autoStart: false });
  let shore;
  for (let y = 0; y < config.height && !shore; y++) {
    for (let x = 0; x < config.width; x++) {
      if (canDrinkAt(world.terrain, config, x, y)) { shore = { x, y }; break; }
    }
  }
  assert.ok(shore, 'test terrain has a reachable shoreline');
  assert.ok(shoreCandidates(world.terrain, config, shore, 20).some(c => c.id === `shore:${shore.x}:${shore.y}`));
  const agent = { id: 'test', ...shore, state: 'idle', currentGoal: { type: 'seek_water' },
    actionTargetId: null, actionTicksRemaining: 0, thirst: 0.5, tiredness: 0.6, hunger: 0 };
  assert.equal(beginActionIfArrived(agent, world.objects, config, 1, world.terrain), true);
  assert.equal(agent.state, 'drinking');
  assert.equal(agent.actionTargetId, null);
  tickAction(agent, world.objects, config, 2, world.terrain);
  assert.ok(agent.thirst < 0.5);
  agent.currentGoal = { type: 'seek_rest' };
  assert.equal(beginActionIfArrived(agent, world.objects, config, 3, world.terrain), true);
  assert.equal(agent.state, 'resting');
  tickAction(agent, world.objects, config, 4, world.terrain);
  assert.ok(agent.tiredness < 0.6);
  agent.tiredness = 0.999;
  decayNeeds(agent, config);
  assert.equal(agent.dead, undefined);
  world.stop();
});

test('terrain drinking recognizes water across the wrapped world edge', () => {
  const base = buildConfig();
  const config = { ...base, width: 5, height: 5 };
  const waterDepthAt = (x, y) => x === 4 && y === 2 ? 2 : 0;
  const terrain = {
    waterDepthAt,
    cellAt: (x, y) => ({ groundType: waterDepthAt(x, y) ? 'deep_water' : 'ground',
      waterDepth: waterDepthAt(x, y), baseMoveCost: waterDepthAt(x, y) ? Infinity : 1 }),
  };
  assert.equal(canDrinkAt(terrain, config, 0, 2), true);
  assert.equal(canDrinkAt(terrain, config, 4, 2), false);
});

test('a completed fruit meal provides hydration without a water action', () => {
  const config = buildConfig();
  const food = { id: 'fruit', type: 'food', x: 1, y: 1 };
  const objects = {
    queryRect: () => [food], isAvailable: () => true,
    tryAcquireResource: () => true, getById: () => food,
    consumeFood: () => true, releaseResource: () => true,
  };
  const agent = { id: 'fruit-eater', x: 1, y: 1, state: 'idle',
    currentGoal: { type: 'seek_food' }, actionTargetId: null,
    hunger: 0.5, thirst: 0.5, actionTicksRemaining: 0 };
  assert.equal(beginActionIfArrived(agent, objects, config, 1), true);
  for (let tick = 2; tick < 2 + config.survival.actionTicks; tick++) {
    tickAction(agent, objects, config, tick);
  }
  assert.equal(agent.state, 'idle');
  assert.equal(agent.thirst, 0.5 - config.survival.fruitHydration);
});

test('multi-cell movement follows the route and restores mid-segment', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'movement-world-'));
  const base = buildConfig();
  const config = { ...base, width: 128, height: 128, agents: { ...base.agents, count: 1 } };
  try {
    const world = createWorld({ config, snapshotDir: dir, autoStart: false });
    const agent = world.agents.listAll()[0];
    const route = Array.from({ length: 40 }, (_, i) => ({ x: wrap(agent.x + i + 1, 128), y: agent.y }));
    world.agents.setPath(agent, route);
    world.agents.stepAgent(agent, 1);
    assert.equal(agent.movementTargetIndex, 31);
    assert.equal(world.agents.publicView(agent, 1).moveCellsPerStep, 32);
    world.saveSnapshot();
    const restored = createWorld({ config, snapshotDir: dir, autoStart: false });
    const resumed = restored.agents.listAll()[0];
    restored.agents.stepAgent(resumed, 2);
    assert.equal(resumed.pathIndex, 32);
    assert.equal(resumed.x, route[31].x);
    assert.ok(restored.chunkIndex.getChunkFromWorld(resumed.x, resumed.y).agentIds.includes(resumed.id));
    restored.stop(); world.stop();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a pre-clock snapshot migrates only with its exact legacy configuration', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-world-'));
  const base = buildConfig();
  const old = { ...buildConfig({ legacy: true }), width: 128, height: 128,
    agents: { ...buildConfig({ legacy: true }).agents, count: 1 } };
  const current = { ...base, width: 128, height: 128, agents: { ...base.agents, count: 1 } };
  try {
    const previous = createWorld({ config: old, snapshotDir: dir, autoStart: false });
    previous.simulation.tick();
    previous.saveSnapshot();
    const oldHash = JSON.parse(fs.readFileSync(path.join(dir, 'world.json'))).configHash;
    previous.stop();
    assert.throws(() => createWorld({ config: current, snapshotDir: dir, autoStart: false }), /mismatch/);
    const upgraded = createWorld({ config: current, legacyConfig: old, snapshotDir: dir, autoStart: false });
    assert.equal(upgraded.simulation.getStatus().tickCount, 1);
    upgraded.saveSnapshot();
    assert.notEqual(JSON.parse(fs.readFileSync(path.join(dir, 'world.json'))).configHash, oldHash);
    upgraded.stop();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the preceding default world restores automatically without resetting progress', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'default-upgrade-world-'));
  try {
    const old = createWorld({ config: buildConfig({ legacy: true }), snapshotDir: dir, autoStart: false });
    old.simulation.tick();
    old.saveSnapshot();
    const originalWorldId = old.simulation.getStatus().worldId;
    old.stop();
    const upgraded = createWorld({ snapshotDir: dir, autoStart: false });
    assert.equal(upgraded.simulation.getStatus().tickCount, 1);
    assert.equal(upgraded.simulation.getStatus().worldId, originalWorldId);
    assert.equal(upgraded.agents.listAll().length, old.agents.listAll().length);
    upgraded.stop();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
