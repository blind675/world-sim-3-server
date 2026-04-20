'use strict';

require('dotenv').config();

const { createApp } = require('./app');
const { getWorld } = require('./world/world');

const app = createApp();
const port = parseInt(process.env.PORT, 10) || 4000;

// Warm up world (builds perlin permutations) so first request is quick.
const { config } = getWorld();

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(
    `[life-sim-v3] backend listening on http://localhost:${port}  ` +
    `world=${config.width}x${config.height} seed=${config.seed} chunk=${config.chunkSize}`
  );
});
