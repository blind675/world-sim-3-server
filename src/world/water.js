'use strict';

const { wrap, wrappedDistance } = require('../utils/wrap');
const { isCellPathable } = require('./agents');

const CARDINAL = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
const RAYS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

function canDrinkAt(terrain, config, x, y) {
  if (!isCellPathable(terrain.cellAt(x, y), config.agents.deepWaterThreshold)) return false;
  return CARDINAL.some(([dx, dy]) => terrain.waterDepthAt(wrap(x + dx, config.width),
    wrap(y + dy, config.height)) > 0);
}

// Sample eight continuous sight lines. The first water cell on each line
// yields an adjacent walkable bank; we never ask A* to enter deep water.
function shoreCandidates(terrain, config, agent, range) {
  const found = new Map();
  if (canDrinkAt(terrain, config, agent.x, agent.y)) {
    found.set(`${agent.x}:${agent.y}`, { x: agent.x, y: agent.y });
  }
  for (const [dx, dy] of RAYS) {
    for (let distance = 1; distance <= range; distance++) {
      const wx = wrap(agent.x + dx * distance, config.width);
      const wy = wrap(agent.y + dy * distance, config.height);
      if (terrain.waterDepthAt(wx, wy) <= 0) continue;
      for (const [ox, oy] of CARDINAL) {
        const x = wrap(wx + ox, config.width);
        const y = wrap(wy + oy, config.height);
        if (isCellPathable(terrain.cellAt(x, y), config.agents.deepWaterThreshold)) {
          found.set(`${x}:${y}`, { x, y });
          break;
        }
      }
      break;
    }
  }
  return [...found.values()].map(({ x, y }) => ({ id: `shore:${x}:${y}`,
    type: 'water_source', x, y }));
}

// Water can be hundreds of cells beyond vision in the large default world.
// A bounded coarse terrain search provides a heading toward a nearby basin;
// it is not a shoreline memory or a drinking target. The agent must still
// approach and perceive a real bank before the baseline counts discovery.
function createWaterGuide(terrain, config) {
  const spacing = Math.max(1, Math.min(32, Math.floor(Math.min(config.width, config.height) / 4)));
  const radius = Math.floor(Math.min(640, Math.max(config.width, config.height) / 2));
  const samples = new Map();
  function hasWater(x, y) {
    const key = `${x}:${y}`;
    if (samples.has(key)) return samples.get(key);
    const water = terrain.waterDepthAt(x, y) > 0;
    samples.set(key, water);
    if (samples.size > 32768) samples.delete(samples.keys().next().value);
    return water;
  }
  function hintAt(x, y) {
    const centerX = Math.floor(x / spacing) * spacing + Math.floor(spacing / 2);
    const centerY = Math.floor(y / spacing) * spacing + Math.floor(spacing / 2);
    let nearest = null;
    let bestDistance = radius;
    for (let dy = -radius; dy <= radius; dy += spacing) {
      for (let dx = -radius; dx <= radius; dx += spacing) {
        const sx = wrap(centerX + dx, config.width);
        const sy = wrap(centerY + dy, config.height);
        const distance = wrappedDistance(x, y, sx, sy, config.width, config.height);
        if (distance >= bestDistance || !hasWater(sx, sy)) continue;
        nearest = { x: sx, y: sy };
        bestDistance = distance;
      }
    }
    return nearest;
  }
  return { hintAt };
}

module.exports = { canDrinkAt, shoreCandidates, createWaterGuide };
