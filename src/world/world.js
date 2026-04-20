'use strict';

const { buildConfig } = require('../config/worldConfig');
const { createTerrain } = require('./terrain');
const { createChunkIndex } = require('./chunkIndex');
const { createObjectStore } = require('./objects');
const { wrap } = require('../utils/wrap');

let singleton = null;

function getWorld() {
  if (singleton) return singleton;
  const config = buildConfig();
  const terrain = createTerrain(config);
  const chunkIndex = createChunkIndex(config);
  const objects = createObjectStore(config, terrain, chunkIndex);
  singleton = { config, terrain, chunkIndex, objects, wrap };
  return singleton;
}

module.exports = { getWorld };
