'use strict';

const { clockAt, TICKS_PER_DAY } = require('./clock');

// Weather is global for one simulated day. Its seed/day hash consumes no
// simulation PRNG draws and requires no mutable state in the snapshot.
const CLIMATE_MODEL_VERSION = 1;
function weatherAt(config, tickCount) {
  const ticksPerDay = config.simulation.ticksPerDay || TICKS_PER_DAY;
  const day = Math.floor(tickCount / ticksPerDay);
  let hash = (config.seed ^ Math.imul(day + 1, 0x9e3779b9)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  const roll = ((hash ^ (hash >>> 16)) >>> 0) % 100;
  if (roll < 50) return { type: 'clear', temperatureOffsetC: 0, visionMultiplier: 1 };
  if (roll < 75) return { type: 'rain', temperatureOffsetC: -2, visionMultiplier: 0.85 };
  if (roll < 88) return { type: 'heatwave', temperatureOffsetC: 5, visionMultiplier: 1 };
  return { type: 'cold_front', temperatureOffsetC: -5, visionMultiplier: 1 };
}

// Temperature is local, but weather is shared by the current day.
function temperatureAt(config, height, tickCount) {
  const ticksPerDay = config.simulation.ticksPerDay || TICKS_PER_DAY;
  const { tickOfDay } = clockAt(tickCount, ticksPerDay);
  const dayFraction = tickOfDay / ticksPerDay;
  const dailySwing = 5 * Math.sin(2 * Math.PI * (dayFraction - 0.25));
  const altitude = Math.max(0, height - config.terrain.seaLevel);
  return 22 + dailySwing - altitude * 0.08 + weatherAt(config, tickCount).temperatureOffsetC;
}

function thermalMultipliers(temperatureC) {
  return {
    hunger: 1 + Math.min(0.2, Math.max(0, 15 - temperatureC) * 0.015),
    thirst: 1 + Math.min(0.2, Math.max(0, temperatureC - 28) * 0.025),
  };
}

module.exports = { CLIMATE_MODEL_VERSION, weatherAt, temperatureAt, thermalMultipliers };
