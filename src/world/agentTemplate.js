'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_PATH = path.resolve(__dirname, '../../config/agent-template.json');
const TRAITS = ['visionRange', 'memoryCapacity', 'memoryDecayRate', 'moveSpeed'];
const STAGES = ['juvenile', 'adult', 'elder'];
const slug = /^[a-z][a-z0-9_]*$/;

function validateAgentTemplate(value) {
  const exact = (object, keys) => object && typeof object === 'object' && !Array.isArray(object)
    && Object.keys(object).length === keys.length && keys.every(key => Object.hasOwn(object, key));
  const positiveInteger = number => Number.isSafeInteger(number) && number >= 0;
  if (!exact(value, ['schemaVersion', 'id', 'revision', 'name', 'species', 'lifeStages',
    'lifespanDays', 'inheritedTraits', 'circadianTypes']) || value.schemaVersion !== 1
    || !slug.test(value.id) || !positiveInteger(value.revision) || value.revision < 1
    || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80
    || typeof value.species !== 'string' || !value.species.trim() || value.species.length > 160
    || !Array.isArray(value.lifeStages) || value.lifeStages.length !== STAGES.length
    || !exact(value.lifespanDays, ['min', 'max'])
    || !positiveInteger(value.lifespanDays.min) || !positiveInteger(value.lifespanDays.max)
    || value.lifespanDays.min <= 400 || value.lifespanDays.max > 10000
    || value.lifespanDays.max < value.lifespanDays.min
    || !exact(value.inheritedTraits, TRAITS)
    || !Array.isArray(value.circadianTypes)
    || value.circadianTypes.length !== 2
    || value.circadianTypes[0] !== 'diurnal' || value.circadianTypes[1] !== 'nocturnal') {
    throw new Error('Invalid agent template');
  }
  for (let i = 0; i < STAGES.length; i++) {
    const stage = value.lifeStages[i];
    if (!exact(stage, ['id', 'startDay']) || stage.id !== STAGES[i]
      || !positiveInteger(stage.startDay) || stage.startDay > 10000
      || (i === 0 ? stage.startDay !== 0 : stage.startDay <= value.lifeStages[i - 1].startDay)) {
      throw new Error('Invalid agent life stages');
    }
  }
  if (value.lifeStages[2].startDay >= value.lifespanDays.min) throw new Error('Elder stage must precede lifespan');
  for (const key of TRAITS) {
    const bounds = value.inheritedTraits[key];
    if (!exact(bounds, ['default', 'min', 'max']) || !['default', 'min', 'max'].every(k =>
      Number.isFinite(bounds[k]) && bounds[k] > 0) || bounds.min > bounds.default
      || bounds.default > bounds.max || bounds.max > 1000) {
      throw new Error(`Invalid agent trait bounds: ${key}`);
    }
  }
  return value;
}

function loadAgentTemplate(filename = process.env.AGENT_TEMPLATE_PATH || DEFAULT_PATH) {
  if (fs.statSync(filename).size > 64 * 1024) throw new Error('Agent template exceeds 64 KiB');
  const data = validateAgentTemplate(JSON.parse(fs.readFileSync(filename, 'utf8')));
  const hash = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  return { ...data, hash, publicView: () => ({ ...data, hash }) };
}

module.exports = { loadAgentTemplate, validateAgentTemplate, DEFAULT_PATH };
