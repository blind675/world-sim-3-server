'use strict';

const { wrap } = require('../utils/wrap');
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

module.exports = { canDrinkAt, shoreCandidates };
