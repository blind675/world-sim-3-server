'use strict';

const TICKS_PER_DAY = 360;

function clockAt(tickCount, ticksPerDay = TICKS_PER_DAY) {
  if (!Number.isSafeInteger(tickCount) || tickCount < 0 || !Number.isSafeInteger(ticksPerDay) || ticksPerDay < 1) {
    throw new Error('Invalid simulation clock');
  }
  const tickOfDay = tickCount % ticksPerDay;
  const minuteOfDay = Math.floor(tickOfDay * 1440 / ticksPerDay);
  return {
    day: Math.floor(tickCount / ticksPerDay) + 1,
    tickOfDay,
    ticksPerDay,
    hour: Math.floor(minuteOfDay / 60),
    minute: minuteOfDay % 60,
  };
}

module.exports = { clockAt, TICKS_PER_DAY };
