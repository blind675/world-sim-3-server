'use strict';

const { buildConfig } = require('../config/worldConfig');
const { createTerrain } = require('./terrain');
const { createChunkIndex } = require('./chunkIndex');
const { createObjectStore } = require('./objects');
const { createAgentStore } = require('./agents');
const { createSimulation } = require('./simulation');
const { wrap } = require('../utils/wrap');

let singleton = null;

function getWorld() {
  if (singleton) return singleton;
  const config = buildConfig();
  const terrain = createTerrain(config);
  const chunkIndex = createChunkIndex(config);
  const objects = createObjectStore(config, terrain, chunkIndex);
  const agents = createAgentStore(config, terrain, chunkIndex);
  const simulation = createSimulation({ config, terrain, chunkIndex, objects, agents, wrap });
  singleton = { config, terrain, chunkIndex, objects, agents, simulation, wrap };
  agents.spawnInitial();
  return singleton;
}

module.exports = { getWorld };
