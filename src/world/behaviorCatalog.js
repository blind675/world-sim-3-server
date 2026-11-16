'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_PATH = path.resolve(__dirname, '../../config/behavior-catalog.json');
const IDS = new Set(['idle', 'look_around', 'explore', 'seek_food', 'seek_water', 'seek_rest']);
const NEEDS = { seek_food: 'hunger', seek_water: 'thirst', seek_rest: 'tiredness' };
const slug = /^[a-z][a-z0-9_]*$/;

function validateBehaviorCatalog(document) {
  if (!document || document.schemaVersion !== 1 || !slug.test(document.id || '')
    || !Number.isSafeInteger(document.revision) || document.revision < 1
    || !Array.isArray(document.definitions) || document.definitions.length !== IDS.size
    || Object.keys(document).some(key => !['schemaVersion', 'id', 'revision', 'definitions'].includes(key))) {
    throw new Error('Invalid behavior catalogue header');
  }
  const ids = new Set();
  for (const def of document.definitions) {
    if (!def || !IDS.has(def.id) || ids.has(def.id)
      || !Number.isSafeInteger(def.maxTicks) || def.maxTicks < 1 || def.maxTicks > 1440) {
      throw new Error(`Invalid behavior definition: ${def?.id}`);
    }
    ids.add(def.id);
    const allowed = def.id in NEEDS
      ? ['id', 'kind', 'algorithm', 'need', 'maxTicks', 'interrupt', 'fallback']
      : def.id === 'explore'
        ? ['id', 'kind', 'algorithm', 'weight', 'minComfort', 'cooldownTicks', 'maxTicks', 'interrupt', 'fallback']
        : ['id', 'kind', 'algorithm', 'weight', 'minComfort', 'cooldownTicks', 'maxTicks', 'interrupt', 'steps'];
    if (Object.keys(def).some(key => !allowed.includes(key))) {
      throw new Error(`Unknown behavior setting: ${def.id}`);
    }
    if (def.id in NEEDS) {
      if (def.kind !== 'survival' || def.algorithm !== def.id || def.need !== NEEDS[def.id]
        || def.fallback !== 'idle' || !['more_urgent', 'fatal_need'].includes(def.interrupt)
        || def.steps !== undefined || def.weight !== undefined) {
        throw new Error(`Invalid survival behavior: ${def.id}`);
      }
      continue;
    }
    if (def.kind !== 'leisure' || def.interrupt !== 'urgent'
      || !Number.isFinite(def.weight) || def.weight <= 0 || def.weight > 100
      || !Number.isFinite(def.minComfort) || def.minComfort < 0 || def.minComfort > 1
      || !Number.isSafeInteger(def.cooldownTicks) || def.cooldownTicks < 0 || def.cooldownTicks > 1440) {
      throw new Error(`Invalid leisure behavior: ${def.id}`);
    }
    if (def.id === 'explore') {
      if (def.algorithm !== 'explore' || def.fallback !== 'idle' || def.steps !== undefined) {
        throw new Error('Invalid explore behavior');
      }
      continue;
    }
    if (def.algorithm !== 'sequence' || def.fallback !== undefined
      || !Array.isArray(def.steps) || def.steps.length < 1 || def.steps.length > 16
      || def.steps.some(step => !step || !['stay', 'turn_left', 'turn_right'].includes(step.action)
        || !Number.isSafeInteger(step.ticks) || step.ticks < 1 || step.ticks > 60
        || (step.action !== 'stay' && step.ticks !== 1)
        || Object.keys(step).some(key => !['action', 'ticks'].includes(key)))
      || def.steps.reduce((sum, step) => sum + step.ticks, 0) > def.maxTicks) {
      throw new Error(`Invalid action sequence: ${def.id}`);
    }
  }
  if (ids.size !== IDS.size || document.definitions.find(def => def.id === 'idle').minComfort !== 0) {
    throw new Error('Behavior catalogue needs an unconditional idle fallback');
  }
  return document;
}

function loadBehaviorCatalog(filename = process.env.BEHAVIOR_CATALOG_PATH || DEFAULT_PATH) {
  if (fs.statSync(filename).size > 64 * 1024) throw new Error('Behavior catalogue exceeds 64 KiB');
  const document = validateBehaviorCatalog(JSON.parse(fs.readFileSync(filename, 'utf8')));
  const hash = crypto.createHash('sha256').update(JSON.stringify(document)).digest('hex');
  const byId = new Map(document.definitions.map(def => [def.id, def]));
  return { ...document, hash, get: id => byId.get(id) || null,
    leisure: document.definitions.filter(def => def.kind === 'leisure'),
    publicView: () => ({ ...document, hash }) };
}

module.exports = { loadBehaviorCatalog, validateBehaviorCatalog, DEFAULT_PATH };
