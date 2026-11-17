'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_PATH = path.resolve(__dirname, '../../config/reproduction-policy.json');
const TRAITS = ['visionRange', 'memoryCapacity', 'memoryDecayRate', 'moveSpeed', 'lifespanDays'];

function validateReproductionPolicy(value) {
  const exact = (object, keys) => object && typeof object === 'object' && !Array.isArray(object)
    && Object.keys(object).length === keys.length && keys.every(key => Object.hasOwn(object, key));
  const integer = n => Number.isSafeInteger(n) && n >= 0;
  if (!exact(value, ['schemaVersion', 'id', 'revision', 'minimumAgeDays', 'maxPopulation',
    'checkIntervalTicks', 'partnerRadiusCells', 'cooldownDays', 'maxHunger', 'maxThirst',
    'hungerCost', 'thirstCost', 'mutation']) || value.schemaVersion !== 1
    || value.id !== 'ground_bird_reproduction' || !integer(value.revision) || value.revision < 1
    || !integer(value.minimumAgeDays) || value.minimumAgeDays < 1 || value.minimumAgeDays > 10000
    || !integer(value.maxPopulation) || value.maxPopulation < 2 || value.maxPopulation > 500
    || !integer(value.checkIntervalTicks) || value.checkIntervalTicks < 1 || value.checkIntervalTicks > 360
    || !integer(value.partnerRadiusCells) || value.partnerRadiusCells < 1 || value.partnerRadiusCells > 64
    || !integer(value.cooldownDays) || value.cooldownDays < 1 || value.cooldownDays > 1000
    || ![value.maxHunger, value.maxThirst].every(n => Number.isFinite(n) && n >= 0 && n <= 0.8)
    || ![value.hungerCost, value.thirstCost].every(n => Number.isFinite(n) && n > 0 && n <= 0.2)
    || value.maxHunger + value.hungerCost >= 1 || value.maxThirst + value.thirstCost >= 1
    || !exact(value.mutation, TRAITS)
    || TRAITS.some(key => !Number.isFinite(value.mutation[key]) || value.mutation[key] < 0
      || value.mutation[key] > (key === 'memoryDecayRate' ? 0.01 : key === 'moveSpeed' ? 0.25 : 50))) {
    throw new Error('Invalid reproduction policy');
  }
  return value;
}

function loadReproductionPolicy(filename = process.env.REPRODUCTION_POLICY_PATH || DEFAULT_PATH) {
  if (fs.statSync(filename).size > 64 * 1024) throw new Error('Reproduction policy exceeds 64 KiB');
  const data = validateReproductionPolicy(JSON.parse(fs.readFileSync(filename, 'utf8')));
  const hash = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  return { ...data, hash, publicView: () => ({ ...data, hash }) };
}

module.exports = { loadReproductionPolicy, validateReproductionPolicy, DEFAULT_PATH };
