'use strict';

const { splitmix32 } = require('../utils/prng');
const { wrap, wrappedDistance } = require('../utils/wrap');
const { isCellPathable } = require('./agents');

const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1]];

function createReproduction({ config, agents, deaths, terrain, agentTemplate, reproductionPolicy: policy }) {
  const ticksPerDay = config.simulation.ticksPerDay || 360;
  const adultDay = agentTemplate.lifeStages.find(stage => stage.id === 'adult').startDay;
  if (policy.minimumAgeDays < adultDay) throw new Error('Reproduction age must start at adulthood');
  const populationCap = Math.max(config.agents.count, policy.maxPopulation);
  const initialRngState = (config.seed ^ 0x5eeda11c) >>> 0;
  const rng = splitmix32(initialRngState);
  let nextBirthId = config.agents.count + 1;
  let birthCount = 0;

  function eligible(agent, tick) {
    return !agent.dead && agent.templateId === agentTemplate.id
      && tick - agent.birthTick >= policy.minimumAgeDays * ticksPerDay
      && agent.hunger <= policy.maxHunger && agent.thirst <= policy.maxThirst
      && (agent.lastBirthTick === null
        || tick - agent.lastBirthTick >= policy.cooldownDays * ticksPerDay);
  }

  function birthCell(mother, occupied) {
    for (const [dx, dy] of NEIGHBORS) {
      const x = wrap(mother.x + dx, config.width);
      const y = wrap(mother.y + dy, config.height);
      if (!occupied.has(`${x}:${y}`)
        && isCellPathable(terrain.cellAt(x, y), config.agents.deepWaterThreshold)) {
        return { x, y };
      }
    }
    return null;
  }

  function inheritedValue(key, mother, father, bounds, integer = false) {
    const middle = (mother + father) / 2;
    const change = (rng() * 2 - 1) * policy.mutation[key];
    const raw = Math.min(bounds.max, Math.max(bounds.min, middle + change));
    const rounded = integer ? Math.round(raw) : Math.round(raw * 100000) / 100000;
    return Math.min(bounds.max, Math.max(bounds.min, rounded));
  }

  function tick(currentTick) {
    if (currentTick % policy.checkIntervalTicks !== 0 || agents.listAll().length >= populationCap) return 0;
    const residents = agents.listAll();
    const occupied = new Set(residents.map(agent => `${agent.x}:${agent.y}`));
    const candidates = residents.filter(agent => eligible(agent, currentTick));
    const used = new Set();
    let births = 0;
    for (const mother of candidates) {
      if (mother.sex !== 'female' || used.has(mother.id)) continue;
      if (residents.length + births >= populationCap) break;
      let father = null;
      let nearest = Infinity;
      for (const candidate of candidates) {
        if (candidate.sex !== 'male' || used.has(candidate.id)) continue;
        const distance = wrappedDistance(mother.x, mother.y, candidate.x, candidate.y,
          config.width, config.height);
        if (distance <= policy.partnerRadiusCells && distance < nearest) {
          father = candidate;
          nearest = distance;
        }
      }
      if (!father) continue;
      const cell = birthCell(mother, occupied);
      if (!cell) continue;
      if (!Number.isSafeInteger(nextBirthId)) throw new Error('Agent birth ID counter exhausted');
      const id = `a-${nextBirthId}`;
      const traits = Object.fromEntries(Object.entries(agentTemplate.inheritedTraits).map(([key, bounds]) =>
        [key, inheritedValue(key, mother.traits[key], father.traits[key], bounds,
          key === 'visionRange' || key === 'memoryCapacity')]));
      traits.circadianType = rng() < 0.5
        ? mother.traits.circadianType : father.traits.circadianType;
      const lifespanDays = inheritedValue('lifespanDays', mother.lifespanDays,
        father.lifespanDays, agentTemplate.lifespanDays, true);
      agents.spawnOffspring({ id, ...cell, birthTick: currentTick, traits, lifespanDays,
        sex: rng() < 0.5 ? 'female' : 'male', facing: Math.floor(rng() * 4) * (Math.PI / 2),
        parentIds: [mother.id, father.id] });
      mother.hunger += policy.hungerCost;
      father.hunger += policy.hungerCost;
      mother.thirst += policy.thirstCost;
      father.thirst += policy.thirstCost;
      mother.lastBirthTick = currentTick;
      father.lastBirthTick = currentTick;
      occupied.add(`${cell.x}:${cell.y}`);
      used.add(mother.id);
      used.add(father.id);
      nextBirthId++;
      birthCount++;
      births++;
    }
    return births;
  }

  function snapshot() {
    return { birthCount, nextBirthId, birthRngState: rng.getState() };
  }

  function restore(state) {
    birthCount = state.birthCount ?? 0;
    const seenIds = [...agents.listAll().map(agent => agent.id),
      ...deaths.getAll().map(death => death.agentId)];
    const greatestId = seenIds.reduce((max, id) => {
      const match = /^a-(\d+)$/.exec(id);
      return match ? Math.max(max, Number(match[1])) : max;
    }, config.agents.count);
    nextBirthId = state.nextBirthId ?? greatestId + 1;
    rng.setState(state.birthRngState ?? initialRngState);
    if (!Number.isSafeInteger(birthCount) || birthCount < 0
      || !Number.isSafeInteger(nextBirthId) || nextBirthId <= greatestId) {
      throw new Error('Invalid snapshot birth counter');
    }
  }

  return { tick, snapshot, restore, getBirthCount: () => birthCount,
    getPopulationCap: () => populationCap };
}

module.exports = { createReproduction };
