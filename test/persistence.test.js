'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { buildConfig } = require('../src/config/worldConfig');
const { createWorld } = require('../src/world/world');

function config() {
  const base = buildConfig();
  return { ...base, width: 128, height: 128, chunkSize: 32,
    agents: { ...base.agents, count: 3 },
    simulation: { tickMs: 100000 },
    survival: { ...base.survival, foodSpreadChance: 1, foodDensityMax: 100 },
  };
}

test('a fresh process restores mutable state and continues the world', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'world-snapshot-'));
  try {
    const world = createWorld({ config: config(), snapshotDir: dir, autoStart: false });
    const [first, second, third] = world.agents.listAll();
    first.memory.push({ id: 'test-memory', type: 'food', x: first.x, y: first.y, confidence: 0.9 });
    first.hunger = 0.4;
    first.currentGoal = { type: 'wander', targetX: first.x, targetY: first.y };
    world.agents.setPath(first, [{ x: first.x, y: first.y }]);
    const food = { id: 'fd-1', type: 'food', x: first.x, y: first.y,
      cx: Math.floor(first.x / config().chunkSize), cy: Math.floor(first.y / config().chunkSize) };
    world.objects.restore({ ...world.objects.snapshot(), dynamicFood: [food], dynamicCounter: 1 });
    for (let i = 0; i < config().survival.foodStock; i++) world.objects.consumeFood(food.id, 0);
    assert.equal(world.objects.getFoodState(food.id, 0).depleted, true);
    assert.equal(world.objects.tryAcquireResource(first.id, food.id), true);
    assert.equal(world.objects.tryAcquireResource(second.id, food.id), false);
    third.hunger = 1;
    world.simulation.tick();
    const original = {
      tick: world.simulation.getStatus().tickCount,
      deaths: world.deaths.getAll(),
      agents: world.agents.listAll(),
      resources: world.objects.snapshot(),
    };
    assert.ok(original.deaths.length > 0);
    world.saveSnapshot();

    const script = `const {createWorld}=require('./src/world/world');
      const world=createWorld({config:JSON.parse(process.env.TEST_CONFIG),snapshotDir:process.env.SNAPSHOT_DIR,autoStart:false});
      const before=structuredClone({tick:world.simulation.getStatus().tickCount,deaths:world.deaths.getAll(),agents:world.agents.listAll(),resources:world.objects.snapshot(),agentIds:world.chunkIndex.getChunkFromWorld(world.agents.listAll()[0].x,world.agents.listAll()[0].y).agentIds,food:world.objects.getFoodState(process.env.FOOD_ID,0)});
      world.simulation.tick(); world.saveSnapshot();
      process.stdout.write(JSON.stringify({before,after:{simulation:world.simulation.snapshot(),agents:world.agents.listAll(),objects:world.objects.snapshot()}}));`;
    const result = JSON.parse(execFileSync(process.execPath, ['-e', script], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, TEST_CONFIG: JSON.stringify(config()), SNAPSHOT_DIR: dir, FOOD_ID: food.id },
    }).toString());
    assert.equal(result.before.tick, original.tick);
    assert.deepEqual(result.before.agents, original.agents);
    assert.deepEqual(result.before.resources, original.resources);
    assert.deepEqual(result.before.deaths, original.deaths);
    assert.ok(result.before.agentIds.includes(first.id));
    assert.equal(result.before.food.depleted, true);
    world.simulation.tick();
    assert.equal(result.after.simulation.tickCount, original.tick + 1);
    assert.deepEqual(result.after.simulation, world.simulation.snapshot());
    assert.deepEqual(result.after.agents, world.agents.listAll());
    assert.deepEqual(result.after.objects, world.objects.snapshot());
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('corruption, incompatibility, and backup recovery', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'world-recovery-'));
  try {
    const cfg = config();
    const world = createWorld({ config: cfg, snapshotDir: dir, autoStart: false });
    world.simulation.tick();
    world.saveSnapshot();
    assert.throws(() => createWorld({ config: { ...cfg, seed: cfg.seed + 1 }, snapshotDir: dir, autoStart: false }), /mismatch/);
    const primary = path.join(dir, 'world.json');
    fs.writeFileSync(path.join(dir, '.world.json.interrupted.tmp'), '{broken');
    assert.equal(createWorld({ config: cfg, snapshotDir: dir, autoStart: false }).simulation.getStatus().tickCount, 1);
    const wrongVersion = JSON.parse(fs.readFileSync(primary, 'utf8'));
    wrongVersion.version = 999;
    fs.writeFileSync(primary, JSON.stringify(wrongVersion));
    assert.throws(() => createWorld({ config: cfg, snapshotDir: dir, autoStart: false }), /version.*incompatible/);
    fs.writeFileSync(primary, '{broken');
    const recovered = createWorld({ config: cfg, snapshotDir: dir, autoStart: false });
    assert.equal(recovered.simulation.getStatus().tickCount, 0);
    recovered.saveSnapshot();
    assert.equal(createWorld({ config: cfg, snapshotDir: dir, autoStart: false }).simulation.getStatus().tickCount, 0);
    fs.writeFileSync(primary, '{broken');
    fs.writeFileSync(`${primary}.bak`, '{broken');
    assert.throws(() => createWorld({ config: cfg, snapshotDir: dir, autoStart: false }), /unusable/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
