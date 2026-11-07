#!/usr/bin/env node
'use strict';

// Small, repeatable smoke benchmark. This deliberately avoids walking the
// full world; cold generation cost is paid only for chunks the viewer asks for.
const { performance } = require('node:perf_hooks');
const { buildConfig } = require('./src/config/worldConfig');
const { createTerrain } = require('./src/world/terrain');

const config = buildConfig();
const start = performance.now();
const terrain = createTerrain(config);
const creationMs = performance.now() - start;
const layers = ['height', 'groundType', 'waterDepth', 'moveCost'];
const samples = Math.min(16, Math.floor(config.width / config.chunkSize) * Math.floor(config.height / config.chunkSize));
const chunksW = Math.floor(config.width / config.chunkSize);

const coldStart = performance.now();
for (let n = 0; n < samples; n++) {
  terrain.generateChunkLayers((n % chunksW) * config.chunkSize, Math.floor(n / chunksW) * config.chunkSize, config.chunkSize, layers);
}
const coldMs = performance.now() - coldStart;

const warmStart = performance.now();
for (let n = 0; n < samples; n++) {
  terrain.generateChunkLayers((n % chunksW) * config.chunkSize, Math.floor(n / chunksW) * config.chunkSize, config.chunkSize, layers);
}
const warmMs = performance.now() - warmStart;

console.log({
  world: `${config.width}x${config.height}`,
  chunkSize: config.chunkSize,
  samples,
  creationMs: +creationMs.toFixed(2),
  coldMs: +coldMs.toFixed(2),
  warmMs: +warmMs.toFixed(2),
  cache: terrain.getCacheStats(),
  memory: terrain.getCacheMemory(),
});
