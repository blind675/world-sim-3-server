'use strict';

const { buildConfig } = require('../config/worldConfig');
const { createTerrain } = require('./terrain');
const { wrap } = require('../utils/wrap');

let singleton = null;

function getWorld() {
  if (singleton) return singleton;
  const config = buildConfig();
  const terrain = createTerrain(config);
  singleton = { config, terrain, wrap };
  return singleton;
}

module.exports = { getWorld };
