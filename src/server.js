'use strict';

require('dotenv').config();
if (process.env.NODE_ENV === 'production' && !process.env.CONTROL_API_TOKEN) {
  throw new Error('CONTROL_API_TOKEN is required in production');
}

const { createApp } = require('./app');
const { getWorld } = require('./world/world');

const app = createApp();
const port = parseInt(process.env.PORT, 10) || 4000;

// Warm up world (builds perlin permutations) so first request is quick.
const world = getWorld();
const { config } = world;


const server = app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(
    `[life-sim-v3] backend listening on http://localhost:${port}  ` +
    `world=${config.width}x${config.height} seed=${config.seed} chunk=${config.chunkSize}`
  );
  console.log(`[life-sim-v3] simulation started automatically`);
});

let shuttingDown = false;
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    // A world reset replaces the singleton. Save the active world, not the
    // instance that existed when this process first opened its listener.
    let activeWorld;
    try { activeWorld = getWorld(); activeWorld.stop(); }
    catch (error) { console.error('[snapshot] active world unavailable during shutdown', error); process.exitCode = 1; }
    server.close(() => {
      try { activeWorld?.saveSnapshot(); }
      catch (error) { console.error('[snapshot] shutdown save failed', error); process.exitCode = 1; }
    });
  });
}
