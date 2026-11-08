'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_PATH = path.resolve(__dirname, '../../config/object-catalog.json');
const STRATEGIES = {
  tree: 'forest', rock: 'outcrop', food: 'berry_patch',
  water_source: 'shoreline', rest_spot: 'forest_rest',
};
const GROUND_TYPES = new Set([
  'deep_water', 'shallow_water', 'mud', 'rock', 'short_grass',
  'tall_grass', 'forest_floor', 'ground',
]);
const slug = /^[a-z][a-z0-9_]*$/;

function validateObjectCatalog(document) {
  if (!document || document.schemaVersion !== 1 || !slug.test(document.id || '')
    || !Number.isSafeInteger(document.revision) || document.revision < 1
    || !Array.isArray(document.definitions) || document.definitions.length === 0
    || document.definitions.length > 128) {
    throw new Error('Invalid object catalogue header (expected schemaVersion 1, id, revision, definitions)');
  }
  const ids = new Set();
  for (const definition of document.definitions) {
    const { id, name, category, behavior, color, sprite, blocksVision, spawn } = definition || {};
    if (!slug.test(id || '') || ids.has(id)) throw new Error(`Invalid or duplicate object definition id: ${id}`);
    ids.add(id);
    if (typeof name !== 'string' || name.trim().length < 1 || name.length > 80
      || !slug.test(category || '') || !Object.hasOwn(STRATEGIES, behavior)
      || !/^#[0-9a-fA-F]{6}$/.test(color || '') || !slug.test(sprite || '')
      || typeof blocksVision !== 'boolean') throw new Error(`Invalid object definition: ${id}`);
    if (!spawn || spawn.strategy !== STRATEGIES[behavior]
      || !Number.isFinite(spawn.weight) || spawn.weight <= 0 || spawn.weight > 100
      || (spawn.preferredGroundTypes !== undefined && (!Array.isArray(spawn.preferredGroundTypes)
        || !spawn.preferredGroundTypes.every(type => GROUND_TYPES.has(type))))
      || (spawn.minHeight !== undefined && !Number.isFinite(spawn.minHeight))
      || (spawn.maxHeight !== undefined && !Number.isFinite(spawn.maxHeight))
      || (spawn.minHeight !== undefined && spawn.maxHeight !== undefined && spawn.minHeight > spawn.maxHeight)) {
      throw new Error(`Invalid spawn settings for object definition: ${id}`);
    }
  }
  // Every existing placement strategy needs an unconditional fallback. Its id
  // matches the legacy type, preserving all world object ids and behavior.
  for (const behavior of Object.keys(STRATEGIES)) {
    const base = document.definitions.find(def => def.id === behavior && def.behavior === behavior);
    if (!base || base.spawn.preferredGroundTypes || base.spawn.minHeight !== undefined
      || base.spawn.maxHeight !== undefined) throw new Error(`Missing unrestricted base definition: ${behavior}`);
  }
  return document;
}

function hashCatalog(document) {
  return crypto.createHash('sha256').update(JSON.stringify(document)).digest('hex');
}

// The exact catalogue that can be applied to pre-catalogue snapshots without
// changing object positions or behavior. Do not recompute this from the file:
// later catalogue revisions must not silently become legacy-compatible.
const LEGACY_UPGRADE_HASH = 'dcacbfd49fb11aa90bdbbf01bae173596ff6a7cb3e0623234963a0bfa8919039';

function loadObjectCatalog(filename = process.env.OBJECT_CATALOG_PATH || DEFAULT_PATH) {
  if (fs.statSync(filename).size > 1024 * 1024) throw new Error('Object catalogue exceeds 1 MiB');
  const document = validateObjectCatalog(JSON.parse(fs.readFileSync(filename, 'utf8')));
  const hash = hashCatalog(document);
  const byId = new Map(document.definitions.map(def => [def.id, def]));
  const byBehavior = new Map(Object.keys(STRATEGIES).map(behavior => [behavior,
    document.definitions.filter(def => def.behavior === behavior)]));

  function choose(behavior, objectId, cell, seed) {
    const eligible = byBehavior.get(behavior).filter(def => {
      const { preferredGroundTypes, minHeight, maxHeight } = def.spawn;
      return (!preferredGroundTypes || preferredGroundTypes.includes(cell.groundType))
        && (minHeight === undefined || cell.height >= minHeight)
        && (maxHeight === undefined || cell.height <= maxHeight);
    });
    // Independent of the placement PRNG: adding a visual variant never moves
    // or renumbers existing objects.
    let n = seed >>> 0;
    for (let i = 0; i < objectId.length; i++) n = Math.imul(n ^ objectId.charCodeAt(i), 16777619) >>> 0;
    const total = eligible.reduce((sum, def) => sum + def.spawn.weight, 0);
    let roll = (n / 0x100000000) * total;
    for (const def of eligible) {
      roll -= def.spawn.weight;
      if (roll < 0) return def;
    }
    return eligible[eligible.length - 1];
  }

  return {
    ...document, hash, legacyCompatible: hash === LEGACY_UPGRADE_HASH,
    get: id => byId.get(id) || null,
    choose,
    publicView: () => ({ ...document, hash }),
  };
}

module.exports = { loadObjectCatalog, validateObjectCatalog, hashCatalog, DEFAULT_PATH };
