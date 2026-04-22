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
  const coneDeg = num('VISION_CONE_DEG', 100);
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
      tickMs: int('SIM_TICK_MS', 10000),
    },
    agents: {
      count: int('AGENT_COUNT', 50),
      // Water shallower than this is still walkable (shallow_water/mud);
      // anything deeper (or the deep_water ground type) is impassable.
      deepWaterThreshold: num('DEEP_WATER_THRESHOLD', 1.2),
    },
    perception: {
      // Full cone aperture in degrees (default 100°). Half-angle used for
      // in-cone tests is derived once here.
      coneDeg,
      coneHalfAngleRad: (coneDeg * Math.PI) / 360, // = (deg/2) * pi/180
      // Omnidirectional near-field radius in cells. Anything within this
      // radius is visible regardless of facing (subject to LOS).
      nearRadius: num('VISION_NEAR_RADIUS', 4),
      // Memory entries with confidence below this value are evicted.
      memoryDecayFloor: num('MEMORY_DECAY_FLOOR', 0.02),
      // --- Memory clustering (v1: trees only) ---
      // Max pairwise distance (cells) between same-type individual memories
      // that still counts them as belonging to the same group.
      clusterRadius: num('MEMORY_CLUSTER_RADIUS', 4),
      // Minimum group size required before individuals collapse into a
      // single cluster memory.
      clusterMinCount: int('MEMORY_CLUSTER_MIN_COUNT', 3),
      // Cluster memories decay at (memoryDecayRate / clusterDecayMultiplier)
      // per tick, i.e. this many times slower than individuals. At 100 and
      // the default 0.01 decay rate, clusters are effectively permanent
      // within a session.
      clusterDecayMultiplier: num('MEMORY_CLUSTER_DECAY_MULT', 100),
    },
  };
  return Object.freeze({
    ...cfg,
    terrain: Object.freeze(cfg.terrain),
    simulation: Object.freeze(cfg.simulation),
    agents: Object.freeze(cfg.agents),
    perception: Object.freeze(cfg.perception),
  });
}

module.exports = { buildConfig };
