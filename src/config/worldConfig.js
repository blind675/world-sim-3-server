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

function buildConfig({ legacy = false } = {}) {
  const coneDeg = num('VISION_CONE_DEG', 100);
  const ticksPerDay = int('SIM_TICKS_PER_DAY', 360);
  const cfg = {
    seed: int('WORLD_SEED', 20260420),
    width: int('WORLD_WIDTH', 5120),
    height: int('WORLD_HEIGHT', 5120),
    cellSize: num('WORLD_CELL_SIZE', 1),
    chunkSize: int('WORLD_CHUNK_SIZE', 64),
    terrainCacheMaxChunks: Math.max(1, int('TERRAIN_CACHE_MAX_CHUNKS', 256)),
    wrapMode: WRAP_MODE,
    terrain: {
      minHeight: num('TERRAIN_MIN_HEIGHT', -10),
      maxHeight: num('TERRAIN_MAX_HEIGHT', 80),
      seaLevel: num('TERRAIN_SEA_LEVEL', 0),
    },
    simulation: {
      // Production runs at a watchable pace; local development stays faster.
      tickMs: int('SIM_TICK_MS', process.env.NODE_ENV === 'production' ? 20000 : 10000),
      ...(!legacy && { ticksPerDay }),
    },
    agents: {
      count: int('AGENT_COUNT', 50),
      // Water shallower than this is still walkable (shallow_water/mud);
      // anything deeper (or the deep_water ground type) is impassable.
      deepWaterThreshold: num('DEEP_WATER_THRESHOLD', 1.2),
      ...(!legacy && { moveCellsPerStep: int('MOVE_CELLS_PER_STEP', 32) }),
    },
    survival: {
      // Needs decay per tick (0->1 scale, 1 = critical/death).
      hungerDecayRate: num('HUNGER_DECAY_RATE', legacy ? 0.0003 : 1 / (ticksPerDay * 7)),
      thirstDecayRate: num('THIRST_DECAY_RATE', legacy ? 0.0005 : 1 / (ticksPerDay * 3)),
      tirednessDecayRate: num('TIREDNESS_DECAY_RATE', legacy ? 0.0002 : 1 / (ticksPerDay * 2)),
      // Thresholds above which a need becomes actionable (priority picker).
      hungerThreshold: num('HUNGER_THRESHOLD', legacy ? 0.45 : 0.2),
      thirstThreshold: num('THIRST_THRESHOLD', legacy ? 0.40 : 0.15),
      tirednessThreshold: num('TIREDNESS_THRESHOLD', legacy ? 0.50 : 0.35),
      // Timed action parameters — how long eat/drink/rest lasts and per-tick
      // restoration amount. Default 8 ticks * 0.05 = 0.40 refill per visit.
      actionTicks: int('ACTION_TICKS', 8),
      actionRestoreRate: num('ACTION_RESTORE_RATE', 0.05),
      // Ticks between a food node depleting and regrowing. On regrowth,
      // the node also tries to spawn one child nearby (spreading).
      foodRegrowTicks: int('FOOD_REGROW_TICKS', 500),
      // Food spreading — both periodic from healthy nodes and on-regrowth.
      foodSpreadRadius: num('FOOD_SPREAD_RADIUS', 15),
      foodSpreadChance: num('FOOD_SPREAD_CHANCE', 0.02),
      foodSpreadInterval: int('FOOD_SPREAD_INTERVAL', 200),
      // Local density cap: abort spread if there are already this many food
      // nodes within the density radius of the target cell.
      foodDensityRadius: num('FOOD_DENSITY_RADIUS', 10),
      foodDensityMax: int('FOOD_DENSITY_MAX', 4),
      // Stock per food node before depletion (number of completed eat actions).
      foodStock: int('FOOD_STOCK', 3),
      ...(!legacy && {
        drinkActionTicks: int('DRINK_ACTION_TICKS', 4),
        drinkRestoreRate: num('DRINK_RESTORE_RATE', 0.15),
        restActionTicks: int('REST_ACTION_TICKS', 120),
        restRestoreRate: num('REST_RESTORE_RATE', 0.004),
        fruitHydration: num('FRUIT_HYDRATION', 0.2),
      }),
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
      // Individual entity memories (trees, rocks, food, etc.) decay at this
      // rate per tick. Lower values make single items more persistent.
      // This is separate from the agent's memoryDecayRate trait.
      entityMemoryDecayRate: num('ENTITY_MEMORY_DECAY_RATE', 0.002),
      // --- Memory clustering (v1: trees only) ---
      // Max pairwise distance (cells) between same-type individual memories
      // that still counts them as belonging to the same group.
      clusterRadius: num('MEMORY_CLUSTER_RADIUS', 10),
      // Minimum group size required before individuals collapse into a
      // single cluster memory.
      clusterMinCount: int('MEMORY_CLUSTER_MIN_COUNT', 3),
      // Cluster memories decay at (memoryDecayRate / clusterDecayMultiplier)
      // per tick, i.e. this many times slower than individuals. At 100 and
      // the default 0.01 decay rate, clusters are effectively permanent
      // within a session.
      clusterDecayMultiplier: num('MEMORY_CLUSTER_DECAY_MULT', 100),
    },
    // --- Altitude-based movement and spawning ---
    altitude: {
      // Movement cost multipliers based on elevation change
      uphillPenaltyMultiplier: num('UPHILL_PENALTY_MULTIPLIER', 1.5),
      downhillBonusMultiplier: num('DOWNHILL_BONUS_MULTIPLIER', 0.9),
      // Minimum height difference (in meters) to apply altitude modifiers
      altitudeDiffThreshold: num('ALTITUDE_DIFF_THRESHOLD', 0.5),
      // Altitude bias for object spawning (0-1, higher = stronger bias)
      foodAltitudeBiasStrength: num('FOOD_ALTITUDE_BIAS_STRENGTH', 0.7),
      restAltitudeBiasStrength: num('REST_ALTITUDE_BIAS_STRENGTH', 0.6),
      // Maximum altitude (in meters) for spawning bias - above this, bias is minimal
      preferredAltitudeMax: num('PREFERRED_ALTITUDE_MAX', 30),
    },
  };
  if (!legacy) {
    if (cfg.simulation.tickMs < 100 || cfg.simulation.tickMs > 3600000) {
      throw new Error('SIM_TICK_MS must be between 100 and 3600000');
    }
    if (cfg.simulation.ticksPerDay < 1 || cfg.simulation.ticksPerDay > 1440) {
      throw new Error('SIM_TICKS_PER_DAY must be between 1 and 1440');
    }
    if (cfg.agents.moveCellsPerStep < 1 || cfg.agents.moveCellsPerStep > 64) {
      throw new Error('MOVE_CELLS_PER_STEP must be between 1 and 64');
    }
    for (const [name, value] of [
      ['DRINK_ACTION_TICKS', cfg.survival.drinkActionTicks],
      ['REST_ACTION_TICKS', cfg.survival.restActionTicks],
    ]) {
      if (value < 1 || value > 1440) throw new Error(`${name} must be between 1 and 1440`);
    }
    if (cfg.survival.fruitHydration < 0 || cfg.survival.fruitHydration > 1) {
      throw new Error('FRUIT_HYDRATION must be between 0 and 1');
    }
  }
  return Object.freeze({
    ...cfg,
    terrain: Object.freeze(cfg.terrain),
    simulation: Object.freeze(cfg.simulation),
    agents: Object.freeze(cfg.agents),
    survival: Object.freeze(cfg.survival),
    perception: Object.freeze(cfg.perception),
    altitude: Object.freeze(cfg.altitude),
  });
}

module.exports = { buildConfig };
