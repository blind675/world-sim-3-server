'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildConfig } = require('../src/config/worldConfig');
const { createWorld } = require('../src/world/world');
const { loadObjectCatalog, validateObjectCatalog, DEFAULT_PATH } = require('../src/world/objectCatalog');

test('catalogue chooses deterministic variants without moving existing objects', () => {
  const catalog = loadObjectCatalog();
  const config = { ...buildConfig(), width: 128, height: 128, chunkSize: 32, agents: { ...buildConfig().agents, count: 0 } };
  const world = createWorld({ config, snapshotDir: null, autoStart: false });
  const first = world.objects.getObjectsInChunk(0, 0);
  assert.ok(first.length > 0);
  assert.ok(first.every(object => catalog.get(object.definitionId)?.behavior === object.type));
  assert.deepEqual(first, createWorld({ config, snapshotDir: null, autoStart: false }).objects.getObjectsInChunk(0, 0));
  assert.deepEqual(catalog.choose('tree', 't-0-0-1', { groundType: 'forest_floor', height: 20 }, config.seed),
    catalog.choose('tree', 't-0-0-1', { groundType: 'forest_floor', height: 20 }, config.seed));
});

test('invalid definitions fail before world startup', () => {
  const original = JSON.parse(fs.readFileSync(DEFAULT_PATH, 'utf8'));
  assert.throws(() => validateObjectCatalog({ ...original, definitions: [...original.definitions, original.definitions[0]] }), /duplicate/);
  assert.throws(() => validateObjectCatalog({ ...original, definitions: original.definitions.map(def => def.id === 'tree' ? { ...def, sprite: '../unsafe' } : def) }), /Invalid object definition/);
  assert.throws(() => validateObjectCatalog({ ...original, definitions: original.definitions.filter(def => def.id !== 'food') }), /Missing unrestricted base/);
  const mushroom = original.definitions.find(def => def.id === 'forest_mushroom');
  assert.throws(() => validateObjectCatalog({ ...original, definitions: [
    ...original.definitions, ...Array.from({ length: 4 }, (_, i) => ({ ...mushroom,
      id: `extra_mushroom_${i}`, spawn: { ...mushroom.spawn, candidatesPerChunk: 64 } })),
  ] }), /exceeds 256/);
});

test('catalogue hash pins new snapshots and upgrades legacy snapshots safely', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'world-catalog-'));
  const customFile = path.join(dir, 'custom.json');
  const config = { ...buildConfig(), width: 128, height: 128, chunkSize: 32, agents: { ...buildConfig().agents, count: 0 } };
  try {
    const custom = JSON.parse(fs.readFileSync(DEFAULT_PATH, 'utf8'));
    custom.revision++;
    fs.writeFileSync(customFile, JSON.stringify(custom));
    const world = createWorld({ config, snapshotDir: dir, autoStart: false });
    world.saveSnapshot();
    const snapshotFile = path.join(dir, 'world.json');
    const document = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
    assert.equal(document.catalogHash, loadObjectCatalog().hash);
    assert.throws(() => createWorld({ config, snapshotDir: dir, objectCatalogPath: customFile, autoStart: false }), /catalogue mismatch/);
    delete document.catalogHash;
    fs.writeFileSync(snapshotFile, JSON.stringify(document));
    assert.equal(createWorld({ config, snapshotDir: dir, autoStart: false }).objectCatalog.hash, loadObjectCatalog().hash);
    assert.throws(() => createWorld({ config, snapshotDir: dir, objectCatalogPath: customFile, autoStart: false }), /legacy snapshot requires/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('habitat objects add positions without moving legacy objects and obey terrain', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'world-habitat-'));
  try {
    const oldFile = path.join(dir, 'old.json');
    const current = JSON.parse(fs.readFileSync(DEFAULT_PATH, 'utf8'));
    fs.writeFileSync(oldFile, JSON.stringify({ ...current, revision: 1,
      definitions: current.definitions.filter(def => def.spawn.strategy !== 'habitat') }));
    assert.equal(loadObjectCatalog(oldFile).hash,
      'dcacbfd49fb11aa90bdbbf01bae173596ff6a7cb3e0623234963a0bfa8919039');
    const base = buildConfig();
    const config = { ...base, width: 512, height: 512, agents: { ...base.agents, count: 0 } };
    const oldWorld = createWorld({ config, objectCatalogPath: oldFile, snapshotDir: null, autoStart: false });
    const world = createWorld({ config, snapshotDir: null, autoStart: false });
    let added = 0;
    for (let cy = 0; cy < 8; cy++) for (let cx = 0; cx < 8; cx++) {
      const objects = world.objects.getObjectsInChunk(cx, cy);
      assert.deepEqual(objects.filter(obj => !obj.id.startsWith('h-')), oldWorld.objects.getObjectsInChunk(cx, cy));
      for (const obj of objects.filter(item => item.id.startsWith('h-'))) {
        added++;
        assert.equal(world.objectCatalog.matchesSpawn(world.objectCatalog.get(obj.definitionId),
          world.terrain.cellAt(obj.x, obj.y)), true);
        assert.equal(world.objects.ensureById(obj.id)?.id, obj.id);
      }
    }
    assert.ok(added > 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the exact previous catalogue restores; unrelated catalogue changes still fail', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'world-catalog-upgrade-'));
  try {
    const oldFile = path.join(dir, 'old.json');
    const current = JSON.parse(fs.readFileSync(DEFAULT_PATH, 'utf8'));
    fs.writeFileSync(oldFile, JSON.stringify({ ...current, revision: 1,
      definitions: current.definitions.filter(def => def.spawn.strategy !== 'habitat') }));
    const base = buildConfig();
    const config = { ...base, width: 128, height: 128, agents: { ...base.agents, count: 0 } };
    const oldWorld = createWorld({ config, objectCatalogPath: oldFile, snapshotDir: dir, autoStart: false });
    oldWorld.simulation.tick();
    oldWorld.saveSnapshot();
    const migrated = createWorld({ config, snapshotDir: dir, autoStart: false });
    assert.equal(migrated.simulation.getStatus().tickCount, 1);
    migrated.saveSnapshot();
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'world.json'), 'utf8')).catalogHash,
      migrated.objectCatalog.hash);
    const customFile = path.join(dir, 'custom.json');
    fs.writeFileSync(customFile, JSON.stringify({ ...current, revision: 3 }));
    assert.throws(() => createWorld({ config, snapshotDir: dir, objectCatalogPath: customFile,
      autoStart: false }), /catalogue mismatch/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('perishable food survives a snapshot and expires from indexes and resource queues', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'world-food-life-'));
  try {
    const base = buildConfig();
    const config = { ...base, agents: { ...base.agents, count: 0 } };
    const world = createWorld({ config, snapshotDir: dir, autoStart: false });
    let source;
    for (let cy = 0; cy < 8 && !source; cy++) for (let cx = 0; cx < 8 && !source; cx++) {
      source = world.objects.getObjectsInChunk(cx, cy).find(obj => obj.definitionId === 'forest_mushroom');
    }
    assert.ok(source, 'the test world needs a mushroom source');
    const state = world.objects.snapshot();
    const child = { id: 'fd-1', type: 'food', definitionId: 'forest_mushroom',
      x: source.x, y: source.y, cx: Math.floor(source.x / config.chunkSize),
      cy: Math.floor(source.y / config.chunkSize), expiresAt: 3 };
    world.objects.restore({ ...state, dynamicFood: [child], dynamicCounter: 1 });
    assert.equal(world.objects.tryAcquireResource('a-1', child.id), true);
    assert.equal(world.objects.tryAcquireResource('a-2', child.id), false);
    world.simulation.tick();
    world.saveSnapshot();
    const restored = createWorld({ config, snapshotDir: dir, autoStart: false });
    assert.equal(restored.objects.getFoodState(child.id, 1).ticksUntilExpiry, 2);
    assert.ok(restored.chunkIndex.getChunk(child.cx, child.cy).objectIds.includes(child.id));
    restored.simulation.tick();
    restored.simulation.tick();
    world.simulation.tick();
    world.simulation.tick();
    assert.deepEqual(restored.objects.snapshot(), world.objects.snapshot());
    assert.equal(restored.objects.getById(child.id), null);
    assert.equal(restored.objects.snapshot().resourceQueues.some(([id]) => id === child.id), false);
    assert.equal(restored.objects.snapshot().resourceUsers.some(([id]) => id === child.id), false);
    assert.equal(restored.objects.snapshot().agentWaitingFor.some(([, id]) => id === child.id), false);
    assert.equal(restored.chunkIndex.getChunk(child.cx, child.cy).objectIds.includes(child.id), false);
    assert.equal(restored.objects.queryRect(child.x, child.y, 1, 1).some(obj => obj.id === child.id), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a depleted mushroom source creates perishable offspring without viewer access', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'world-mushroom-source-'));
  try {
    const base = buildConfig();
    const config = { ...base, agents: { ...base.agents, count: 0 },
      survival: { ...base.survival, foodRegrowTicks: 1, foodSpreadRadius: 2,
        foodDensityMax: 100 } };
    const world = createWorld({ config, snapshotDir: dir, autoStart: false });
    const sources = [];
    for (let cy = 0; cy < 8; cy++) for (let cx = 0; cx < 8; cx++) {
      sources.push(...world.objects.getObjectsInChunk(cx, cy).filter(obj => obj.definitionId === 'forest_mushroom'));
    }
    assert.ok(sources.length > 0);
    for (const source of sources.slice(0, 30)) {
      for (let i = 0; i < config.survival.foodStock; i++) world.objects.consumeFood(source.id, 0);
    }
    world.saveSnapshot();
    const restored = createWorld({ config, snapshotDir: dir, autoStart: false });
    assert.equal(restored.objects.getById(sources[0].id)?.definitionId, 'forest_mushroom');
    assert.equal(restored.objects.getFoodState(sources[0].id, 0).depleted, true);
    restored.simulation.tick();
    world.simulation.tick();
    assert.deepEqual(restored.objects.snapshot(), world.objects.snapshot());
    const child = restored.objects.snapshot().dynamicFood.find(node => node.definitionId === 'forest_mushroom');
    assert.ok(child, 'regrowth should create a mushroom offspring');
    assert.equal(child.expiresAt, 361);
    assert.equal(restored.objects.getFoodState(child.id, 1).capacity, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
