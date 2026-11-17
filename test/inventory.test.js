'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { buildConfig } = require('../src/config/worldConfig');
const { createWorld } = require('../src/world/world');
const { isCellPathable } = require('../src/world/agents');
const { beginActionIfArrived, tickAction, pickUrgentNeed } = require('../src/world/needs');

function config(count = 1) {
  const base = buildConfig();
  return { ...base, width: 256, height: 256, chunkSize: 32,
    agents: { ...base.agents, count } };
}

function moveTo(world, agent, x, y) {
  world.chunkIndex.removeAgentId(agent._cx, agent._cy, agent.id);
  agent.x = x;
  agent.y = y;
  agent._cx = Math.floor(x / world.config.chunkSize);
  agent._cy = Math.floor(y / world.config.chunkSize);
  world.chunkIndex.addAgentId(agent._cx, agent._cy, agent.id);
  world.agents.setPath(agent, []);
  agent.behaviorState = null;
}

function foodAndStep(world) {
  const { width, height } = world.config;
  for (const food of world.objects.queryRect(0, 0, width, height, new Set(['food']))) {
    if (!world.objects.isFruitSource(food.id)) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = (food.x + dx + width) % width;
      const y = (food.y + dy + height) % height;
      if (isCellPathable(world.terrain.cellAt(x, y), world.config.agents.deepWaterThreshold)) {
        return { food, step: { x, y } };
      }
    }
  }
  throw new Error('No food with a walkable adjacent cell');
}

test('one fruit transfers from a source, moves with the agent, and is eaten after replay', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-replay-'));
  try {
    const cfg = config();
    const world = createWorld({ config: cfg, snapshotDir: directory, autoStart: false });
    world.simulation.tick();
    const { food, step } = foodAndStep(world);
    const agent = world.agents.listAll()[0];
    moveTo(world, agent, food.x, food.y);
    agent.hunger = 0.25;
    agent.thirst = 0;
    agent.tiredness = 0;
    agent.currentGoal = { type: 'seek_food', targetX: food.x, targetY: food.y };
    const stockBefore = world.objects.getFoodState(food.id, 1).stock;
    assert.equal(beginActionIfArrived(agent, world.objects, cfg, 1), true);
    assert.equal(agent.state, 'collecting_food');
    tickAction(agent, world.objects, cfg, 1);
    assert.equal(world.objects.getFoodState(food.id, 1).stock, stockBefore - 1);
    assert.deepEqual(agent.inventory, [{ kind: 'fruit', sourceId: food.id,
      definitionId: food.definitionId, pickedTick: 1 }]);
    assert.deepEqual(world.agents.detailView(agent, 1).inventory, agent.inventory);
    assert.equal(agent.hunger, 0.25, 'pickup does not satisfy hunger');
    assert.equal(pickUrgentNeed(agent, cfg, 1)?.need, undefined,
      'a carried fruit lets the agent walk before eating');
    agent.hunger = 0.34;
    assert.equal(pickUrgentNeed(agent, cfg, 1)?.need, undefined,
      'a carried fruit is saved until the later meal threshold');
    agent.hunger = 0.25;
    agent.currentGoal = { type: 'seek_food', targetX: food.x, targetY: food.y };
    assert.equal(beginActionIfArrived(agent, world.objects, cfg, 1), false,
      'one-item inventory blocks a second pickup');
    agent.currentGoal = null;
    world.saveSnapshot();
    const restored = createWorld({ config: cfg, snapshotDir: directory, autoStart: false });
    assert.deepEqual(restored.snapshotState(), world.snapshotState());

    for (const instance of [world, restored]) {
      const resident = instance.agents.getById(agent.id);
      instance.agents.setPath(resident, [step]);
      instance.simulation.tick(); // Begin a walking segment.
      instance.simulation.tick(); // Commit the step.
      assert.deepEqual({ x: resident.x, y: resident.y }, step);
      assert.equal(resident.inventory.length, 1);
      resident.hunger = 0.36;
      resident.behaviorState = null;
      instance.simulation.tick();
      assert.equal(resident.state, 'eating_carried');
      resident.thirst = 0.9; // A competing urgent need must not duplicate a partial meal.
    }
    assert.deepEqual(restored.snapshotState(), world.snapshotState());
    world.saveSnapshot();
    const midMeal = createWorld({ config: cfg, snapshotDir: directory, autoStart: false });
    assert.deepEqual(midMeal.snapshotState(), world.snapshotState());
    for (const instance of [world, restored, midMeal]) {
      const resident = instance.agents.getById(agent.id);
      for (let i = 0; i < cfg.survival.actionTicks; i++) instance.simulation.tick();
      assert.equal(resident.inventory.length, 0);
      assert.ok(resident.hunger < 0.36);
      assert.ok(resident.thirst < 0.9, 'the carried fruit applies hydration once at meal completion');
      assert.equal(instance.objects.getFoodState(food.id, instance.simulation.getStatus().tickCount).stock,
        stockBefore - 1, 'eating never consumes the source again');
    }
    assert.deepEqual(restored.snapshotState(), world.snapshotState());
    assert.deepEqual(midMeal.snapshotState(), world.snapshotState());
    restored.saveSnapshot();
    const resumed = createWorld({ config: cfg, snapshotDir: directory, autoStart: false });
    assert.deepEqual(resumed.snapshotState(), restored.snapshotState());
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('mushroom patches keep their direct meal and never create a fruit item', () => {
  const cfg = config();
  const world = createWorld({ config: cfg, snapshotDir: null, autoStart: false });
  const mushroom = world.objects.queryRect(0, 0, cfg.width, cfg.height, new Set(['food']))
    .find(object => object.definitionId === 'forest_mushroom');
  assert.ok(mushroom);
  assert.equal(world.objects.isFruitSource(mushroom.id), false);
  const agent = world.agents.listAll()[0];
  moveTo(world, agent, mushroom.x, mushroom.y);
  agent.currentGoal = { type: 'seek_food', targetX: mushroom.x, targetY: mushroom.y };
  const stockBefore = world.objects.getFoodState(mushroom.id, 0).stock;
  assert.equal(beginActionIfArrived(agent, world.objects, cfg, 0), true);
  assert.equal(agent.state, 'eating');
  for (let tick = 1; tick <= cfg.survival.actionTicks; tick++) tickAction(agent, world.objects, cfg, tick);
  assert.equal(agent.inventory.length, 0);
  assert.equal(world.objects.getFoodState(mushroom.id, cfg.survival.actionTicks).stock, stockBefore - 1);
});

test('a saved pre-inventory berry meal finishes once after restoration', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-meal-replay-'));
  try {
    const cfg = config();
    const world = createWorld({ config: cfg, snapshotDir: directory, autoStart: false });
    world.simulation.tick();
    const { food } = foodAndStep(world);
    const agent = world.agents.listAll()[0];
    moveTo(world, agent, food.x, food.y);
    agent.hunger = 0.5;
    agent.currentGoal = { type: 'seek_food', targetX: food.x, targetY: food.y };
    agent.state = 'eating';
    agent.currentAction = 'eating';
    agent.actionTargetId = food.id;
    agent.actionTicksRemaining = cfg.survival.actionTicks;
    assert.equal(world.objects.tryAcquireResource(agent.id, food.id), true);
    const stockBefore = world.objects.getFoodState(food.id, 1).stock;
    world.saveSnapshot();
    const filename = path.join(directory, 'world.json');
    const document = JSON.parse(fs.readFileSync(filename, 'utf8'));
    delete document.state.agents[0].inventory;
    document.checksum = crypto.createHash('sha256').update(JSON.stringify(document.state)).digest('hex');
    fs.writeFileSync(filename, JSON.stringify(document));
    const restored = createWorld({ config: cfg, snapshotDir: directory, autoStart: false });
    assert.deepEqual(restored.snapshotState(), world.snapshotState());
    for (const instance of [world, restored]) {
      for (let i = 0; i < cfg.survival.actionTicks; i++) instance.simulation.tick();
      assert.equal(instance.agents.getById(agent.id).inventory.length, 0);
      assert.equal(instance.objects.getFoodState(food.id, instance.simulation.getStatus().tickCount).stock,
        stockBefore - 1);
    }
    assert.deepEqual(restored.snapshotState(), world.snapshotState());
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('a single remaining serving cannot be collected twice by competing agents', () => {
  const base = config(2);
  const cfg = { ...base, survival: { ...base.survival, foodStock: 1 } };
  const world = createWorld({ config: cfg, snapshotDir: null, autoStart: false });
  const { food } = foodAndStep(world);
  const [first, second] = world.agents.listAll();
  for (const agent of [first, second]) {
    moveTo(world, agent, food.x, food.y);
    agent.currentGoal = { type: 'seek_food', targetX: food.x, targetY: food.y };
  }
  assert.equal(beginActionIfArrived(first, world.objects, cfg, 0), true);
  assert.equal(beginActionIfArrived(second, world.objects, cfg, 0), true);
  assert.equal(first.state, 'collecting_food');
  assert.equal(second.state, 'waiting');
  tickAction(first, world.objects, cfg, 0);
  assert.equal(first.inventory.length, 1);
  assert.equal(world.objects.getFoodState(food.id, 0).stock, 0);
  assert.equal(world.objects.isAvailable(food.id, 0), false);
  assert.equal(beginActionIfArrived(second, world.objects, cfg, 0), false);
  assert.equal(second.inventory.length, 0);
  world.objects.removeAgentFromResources(second.id);
});

test('invalid or over-capacity carried inventory is rejected on restore', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inventory-invalid-'));
  try {
    const cfg = config();
    createWorld({ config: cfg, snapshotDir: directory, autoStart: false });
    const filename = path.join(directory, 'world.json');
    const document = JSON.parse(fs.readFileSync(filename, 'utf8'));
    const item = { kind: 'fruit', sourceId: 'f-test', definitionId: null, pickedTick: 0 };
    document.state.agents[0].inventory = [item, item];
    document.checksum = crypto.createHash('sha256').update(JSON.stringify(document.state)).digest('hex');
    fs.writeFileSync(filename, JSON.stringify(document));
    assert.throws(() => createWorld({ config: cfg, snapshotDir: directory, autoStart: false }),
      /Snapshot is corrupt: Invalid snapshot inventory/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
