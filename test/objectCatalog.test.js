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
