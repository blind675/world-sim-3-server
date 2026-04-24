'use strict';

const { buildConfig } = require('../config/worldConfig');
const { createTerrain } = require('./terrain');
const { createChunkIndex } = require('./chunkIndex');
const { createObjectStore } = require('./objects');
const { createAgentStore } = require('./agents');
const { createPerception } = require('./perception');
const { createSimulation } = require('./simulation');
const { createDeathStore } = require('./deaths');
const { wrap } = require('../utils/wrap');

let singleton = null;

function getWorld() {
  if (singleton) return singleton;
  const config = buildConfig();
  const terrain = createTerrain(config);
  const chunkIndex = createChunkIndex(config);
  const objects = createObjectStore(config, terrain, chunkIndex);
  const agents = createAgentStore(config, terrain, chunkIndex);
  const deaths = createDeathStore();
  // Perception needs references to the other stores; build it eagerly so the
  // simulation tick loop can call perceiveAgent() without extra wiring.
  const worldRef = { config, terrain, chunkIndex, objects, agents };
  const perception = createPerception(worldRef);
  const simulation = createSimulation({ config, terrain, chunkIndex, objects, agents, perception, deaths, wrap });
  singleton = { config, terrain, chunkIndex, objects, agents, perception, simulation, deaths, wrap };
  agents.spawnInitial();
  return singleton;
}

module.exports = { getWorld };
