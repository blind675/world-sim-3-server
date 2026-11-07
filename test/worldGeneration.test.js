'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildConfig } = require('../src/config/worldConfig');
const { createTerrain } = require('../src/world/terrain');
const { createChunkIndex } = require('../src/world/chunkIndex');
const { createObjectStore } = require('../src/world/objects');
const { beginActionIfArrived, tickAction } = require('../src/world/needs');

function testConfig(overrides = {}) {
  return {
    ...buildConfig(),
    width: 256,
    height: 256,
    chunkSize: 64,
    terrainCacheMaxChunks: 2,
    seed: 12345,
    ...overrides,
  };
}

test('terrain chunks are lazy, complete, bounded, and reproducible after eviction', () => {
  const config = testConfig();
  const terrain = createTerrain(config);
  assert.equal(terrain.getCacheStats().cacheSize, 0);

  const first = terrain.generateChunkLayers(0, 0, 64, ['height']);
  assert.equal(first.height.length, 64 * 64);
  const ground = terrain.generateChunkLayers(0, 0, 64, ['groundType']);
  assert.equal(ground.groundType.length, 64 * 64);
  assert.equal(terrain.getCacheStats().hits, 1);

  terrain.generateChunkLayers(64, 0, 64, ['height']);
  terrain.generateChunkLayers(128, 0, 64, ['height']);
  assert.equal(terrain.getCacheStats().cacheSize, 2);
  assert.equal(terrain.getCacheStats().evictions, 1);

  const regenerated = terrain.generateChunkLayers(0, 0, 64, ['height', 'groundType']);
  assert.deepEqual(regenerated.height, first.height);
  assert.deepEqual(regenerated.groundType, ground.groundType);
  assert.equal(terrain.getCacheStats().cacheSize, 2);
});

test('static objects depend on seed and chunk, not generation order', () => {
  const config = testConfig({ terrainCacheMaxChunks: 4 });
  function makeStore() {
    const terrain = createTerrain(config);
    return createObjectStore(config, terrain, createChunkIndex(config));
  }
  const forward = makeStore();
  const reverse = makeStore();
  const coords = [];
  for (let cy = 0; cy < 4; cy++) {
    for (let cx = 0; cx < 4; cx++) coords.push([cx, cy]);
  }
  assert.equal(forward.getGeneratedCounts().generatedChunks, 0);

  const a = new Map();
  const b = new Map();
  for (const [cx, cy] of coords) a.set(`${cx},${cy}`, forward.getObjectsInChunk(cx, cy));
  for (const [cx, cy] of coords.slice().reverse()) b.set(`${cx},${cy}`, reverse.getObjectsInChunk(cx, cy));
  assert.ok([...a.values()].some(objects => objects.length > 0));
  for (const [key, objects] of a) assert.deepEqual(objects, b.get(key));
  assert.equal(forward.getGeneratedCounts().generatedChunks, 16);
  assert.equal(reverse.getGeneratedCounts().generatedChunks, 16);
});

test('viewing static food does not start food spreading', () => {
  const base = testConfig();
  const config = {
    ...base,
    survival: { ...base.survival, foodSpreadInterval: 1, foodSpreadChance: 1 },
  };
  const store = createObjectStore(config, createTerrain(config), createChunkIndex(config));
  store.queryRect(0, 0, 256, 256, new Set(['food']));
  const before = store.getGeneratedCounts();
  assert.ok(before.foodNodes > 0);
  store.tickFoodSpread(1);
  assert.deepEqual(store.getGeneratedCounts(), before);
});

test('agents wait for an occupied resource and acquire it after release', () => {
  const config = testConfig();
  const store = createObjectStore(config, createTerrain(config), createChunkIndex(config));
  const food = store.queryRect(0, 0, 256, 256, new Set(['food']))[0];
  assert.ok(food);
  function agent(id) {
    return {
      id, x: food.x, y: food.y, state: 'idle', currentGoal: { type: 'seek_food' },
      currentAction: null, actionTargetId: null, actionTicksRemaining: 0, hunger: 0.8,
    };
  }
  const first = agent('first');
  const second = agent('second');
  assert.equal(beginActionIfArrived(first, store, config, 0), true);
  assert.equal(beginActionIfArrived(second, store, config, 0), true);
  assert.equal(first.state, 'eating');
  assert.equal(second.state, 'waiting');
  assert.equal(first.actionTargetId, second.actionTargetId);

  for (let tick = 1; tick <= config.survival.actionTicks; tick++) {
    tickAction(first, store, config, tick);
  }
  assert.equal(first.state, 'idle');
  assert.equal(store.tryAcquireResource(second.id, second.actionTargetId), true);
  assert.equal(store.tryAcquireResource('third', second.actionTargetId), false);
  store.removeAgentFromResources(second.id);
  assert.equal(store.tryAcquireResource('third', second.actionTargetId), true);
});
