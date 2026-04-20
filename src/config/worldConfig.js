'use strict';

const WRAP_MODE = 'toroidal';

function int(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function num(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function buildConfig() {
  const cfg = {
    seed: int('WORLD_SEED', 20260420),
    width: int('WORLD_WIDTH', 5120),
    height: int('WORLD_HEIGHT', 5120),
    cellSize: num('WORLD_CELL_SIZE', 1),
    chunkSize: int('WORLD_CHUNK_SIZE', 128),
    wrapMode: WRAP_MODE,
    terrain: {
      minHeight: num('TERRAIN_MIN_HEIGHT', -10),
      maxHeight: num('TERRAIN_MAX_HEIGHT', 80),
      seaLevel: num('TERRAIN_SEA_LEVEL', 0),
    },
    simulation: {
      tickMs: int('SIM_TICK_MS', 200),
    },
  };
  return Object.freeze({
    ...cfg,
    terrain: Object.freeze(cfg.terrain),
    simulation: Object.freeze(cfg.simulation),
  });
}

module.exports = { buildConfig };
