'use strict';

const { clockAt, TICKS_PER_DAY } = require('./clock');

// A fixed circadian assignment adds no draws to the simulation PRNG. This is
// also used when an older snapshot has no preference yet.
function circadianTypeFor(seed, id) {
  const number = Number(String(id).replace(/^a-/, '')) || 0;
  let hash = (seed ^ Math.imul(number, 0x9e3779b9)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return ((hash ^ (hash >>> 16)) >>> 0) % 5 === 0 ? 'nocturnal' : 'diurnal';
}

function lightAt(tickCount, ticksPerDay = TICKS_PER_DAY) {
  const clock = clockAt(tickCount, ticksPerDay);
  const hour = clock.hour + clock.minute / 60;
  let level = 0.55;
  if (hour >= 6 && hour < 18) level = 1;
  else if (hour >= 5 && hour < 6) level = 0.55 + 0.45 * (hour - 5);
  else if (hour >= 18 && hour < 19) level = 1 - 0.45 * (hour - 18);
  return { phase: hour >= 6 && hour < 18 ? 'day' : 'night', level };
}

function isPreferredSleepTime(agent, tickCount, ticksPerDay = TICKS_PER_DAY) {
  const phase = lightAt(tickCount, ticksPerDay).phase;
  return agent.traits?.circadianType === 'nocturnal' ? phase === 'day' : phase === 'night';
}

function effectiveVisionRange(agent, config, tickCount) {
  const base = agent.traits.visionRange;
  const ambient = lightAt(tickCount, config.simulation.ticksPerDay || TICKS_PER_DAY).level;
  const light = agent.traits.circadianType === 'nocturnal'
    ? ambient + (1 - ambient) * 0.6 : ambient;
  // Fatigue starts impairing sight at 0.5, well before any fatal condition.
  const fatigue = 1 - 0.6 * Math.max(0, Math.min(0.5, (agent.tiredness || 0) - 0.5));
  return Math.max(config.perception.nearRadius, Math.floor(base * light * fatigue));
}

module.exports = { circadianTypeFor, lightAt, isPreferredSleepTime, effectiveVisionRange };
