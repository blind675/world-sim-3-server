'use strict';

// Deterministic static object store for Phase 2.
//
// Objects (trees, rocks) are generated lazily per chunk from a seeded PRNG.
// Same world seed + same chunk coords always produce the same objects, so
// no persistence is needed. Generation registers object ids with the chunk
// index on first access and caches the result.

const { splitmix32 } = require('../utils/prng');
const { createPerlin4D } = require('./perlin');
const { wrappedDistance } = require('../utils/wrap');

// Candidate counts per 128x128 chunk. We sample more candidates than Phase 2a
// because each one also has to pass a low-frequency density field (forest /
// outcrop mask), which rejects most candidates outside clusters.
const TREE_CANDIDATES_PER_CHUNK = 150;
const ROCK_CANDIDATES_PER_CHUNK = 40;
const FOOD_CANDIDATES_PER_CHUNK = 40;
const WATER_CANDIDATES_PER_CHUNK = 60;
const REST_CANDIDATES_PER_CHUNK = 30;

// Feature sizes for clustering (cycles per world). With width=5120:
//   8  cycles -> ~640 m forest blobs (big woodlands)
//   22 cycles -> ~233 m inner texture (variation inside a forest)
//   18 cycles -> ~284 m rock outcrops
//   14 cycles -> ~366 m berry patches
const FOREST_LOW = 8;
const FOREST_HIGH = 22;
const OUTCROP_FREQ = 18;
const BERRY_FREQ = 14;
const TWO_PI = Math.PI * 2;

// Tree accept set: vegetated, walkable terrain above water.
const TREE_GROUND = new Set(['ground', 'forest_floor', 'tall_grass']);
// Food (berry bushes) grow in open ground or forest floor.
const FOOD_GROUND = new Set(['ground', 'forest_floor']);
// Rest spots: walkable vegetated ground.
const REST_GROUND = new Set(['ground', 'forest_floor']);

function acceptTree(cell, config) {
  // Calculate height percentage (0% = minHeight, 100% = maxHeight)
  const heightRange = config.terrain.maxHeight - config.terrain.minHeight;
  const heightPercent = (cell.height - config.terrain.minHeight) / heightRange;

  // Trees don't spawn below 5% of world height (was < 2m, now ~4.5m in default config)
  if (heightPercent < 0.05) return false;

  // Very high probability on forest_floor (prime forest habitat)
  if (cell.groundType === 'forest_floor') return Math.random() < 0.9;
  // High probability on tall_grass (good for trees)
  if (cell.groundType === 'tall_grass') return Math.random() < 0.4;
  // Moderate probability on short_grass (some trees in high meadows)
  if (cell.groundType === 'short_grass') return Math.random() < 0.15;
  // Low probability on ground (scattered trees)
  if (cell.groundType === 'ground') return Math.random() < 0.05;

  return false;
}
function acceptRock(cell, config) {
  // Calculate height percentage (0% = minHeight, 100% = maxHeight)
  const heightRange = config.terrain.maxHeight - config.terrain.minHeight;
  const heightPercent = (cell.height - config.terrain.minHeight) / heightRange;

  // Always accept on rock ground type
  if (cell.groundType === 'rock') return true;
  // High probability on short_grass (high altitude, rocky areas)
  if (cell.groundType === 'short_grass') return Math.random() < 0.5;
  // Moderate probability on tall_grass (sloped areas)
  if (cell.groundType === 'tall_grass') return Math.random() < 0.2;
  // Low probability on terrain above 35% of world height (was > 25m, now ~32.5m in default config)
  if (heightPercent > 0.35) return Math.random() < 0.15;
  return false;
}

function acceptFood(cell, config) {
  // Calculate height percentage (0% = minHeight, 100% = maxHeight)
  const heightRange = config.terrain.maxHeight - config.terrain.minHeight;
  const heightPercent = (cell.height - config.terrain.minHeight) / heightRange;

  // Food doesn't spawn below 2% of world height (was < 1m, now ~1.8m in default config)
  if (heightPercent < 0.02) return false;

  // Very high probability on tall_grass (berry bushes in grasslands)
  if (cell.groundType === 'tall_grass') return Math.random() < 0.8;
  // High probability on forest_floor (berries in forest understory)
  if (cell.groundType === 'forest_floor') return Math.random() < 0.5;
  // Moderate probability on ground (some berries in open terrain)
  if (cell.groundType === 'ground') return Math.random() < 0.2;

  return false;
}

// Water sources sit on the water's edge — shallow water or mud right at
// the shoreline. Deeper cells are excluded so they read as accessible
// drinking points rather than lake interior.
function acceptWater(cell) {
  if (cell.groundType === 'shallow_water') return cell.waterDepth <= 1.2;
  if (cell.groundType === 'mud') return true;
  return false;
}
function acceptRest(cell) {
  return REST_GROUND.has(cell.groundType);
}

// Calculate altitude bias for spawning (0-1, higher = more likely to spawn)
function altitudeBias(height, biasStrength, preferredMax) {
  if (biasStrength <= 0) return 1.0;
  // Normalize height to 0-1 range based on preferred maximum
  const normalizedHeight = Math.max(0, Math.min(1, height / preferredMax));
  // Lower altitude = higher bias
  const bias = 1.0 - (biasStrength * normalizedHeight);
  // Clamp to reasonable range
  return Math.max(0.1, Math.min(1.0, bias));
}

// Hash two ints into a 32-bit seed. Combine with world seed to sub-seed
// each chunk independently and reproducibly.
function hashChunk(seed, cx, cy) {
  let h = (seed >>> 0) ^ 0xdeadbeef;
  h = Math.imul(h ^ (cx * 0x9e3779b1) >>> 0, 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (cy * 0xc2b2ae35) >>> 0, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

function createObjectStore(config, terrain, chunkIndex) {
  const { seed, chunkSize, width, height } = config;
  const survival = config.survival;
  const altitude = config.altitude;
  // chunkKey -> { objects: [...], generated: true }
  const byChunk = new Map();
  // id -> object (static chunk-generated + dynamic spawned food)
  const byId = new Map();

  // --- Food depletion + dynamic nodes (M5) ---
  // food id -> remaining stock. Missing entries are treated as full stock.
  const foodStock = new Map();
  // food id -> tick at which it regrows (back to full stock). Only set
  // while the node is depleted.
  const regrowsAt = new Map();
  // dynamic food nodes (spawned by spreading) — stored separately from
  // the static per-chunk map so they don't pollute the seed-based cache.
  // key: dynamicId -> { id, type:'food', x, y, cx, cy }
  const dynamicFood = new Map();
  // dynamic ids are keyed by a monotonic counter.
  let dynamicCounter = 0;
  // RNG for dynamic spread decisions — seeded from world seed so runs are
  // reproducible within a session.
  const spreadRng = splitmix32((seed ^ 0xbeeff00d) >>> 0);

  // --- Resource queuing (M6) ---
  // resource id -> array of agent ids waiting in queue
  const resourceQueues = new Map();
  // agent id -> resource id they're waiting for
  const agentWaitingFor = new Map();

  // --- Seamless density fields for clustering ---
  // Two independent noise layers (one for forests, one for outcrops). Mapped
  // onto 4D circles the same way as terrain.js so the fields wrap seamlessly.
  const forestNoise = createPerlin4D(seed ^ 0x13579bdf);
  const outcropNoise = createPerlin4D(seed ^ 0x2468ace0);
  const berryNoise = createPerlin4D(seed ^ 0x36c9a5e1);
  const kx = TWO_PI / width;
  const ky = TWO_PI / height;

  function seamless(noiseFn, x, y, fx, fy) {
    const ax = kx * x * fx;
    const ay = ky * y * fy;
    return noiseFn(Math.cos(ax), Math.sin(ax), Math.cos(ay), Math.sin(ay));
  }

  // Tree density in [0,1]. Two octaves combined and remapped with a sharp
  // threshold so forests read as clusters with soft edges and clearings
  // between them.
  function forestDensity(x, y) {
    const a = seamless(forestNoise.noise, x, y, FOREST_LOW, FOREST_LOW);   // ~[-0.8, 0.8]
    const b = seamless(forestNoise.noise, x, y, FOREST_HIGH, FOREST_HIGH);
    // Normalise to [0,1] with large octave dominating.
    const n = 0.5 + 0.55 * a + 0.22 * b;
    // Sharp threshold so ~35-45% of the world is treeless clearing and forests
    // read as distinct blobs with soft edges.
    const t = (n - 0.48) / 0.22;
    return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); // smoothstep
  }

  // Rock density in [0,1]. Peakier than forests to produce outcrop-like
  // hotspots rather than broad bands.
  function outcropDensity(x, y) {
    const n = seamless(outcropNoise.noise, x, y, OUTCROP_FREQ, OUTCROP_FREQ);
    // Absolute value gives ridge-like peaks; threshold filters out broad
    // areas so only the strongest ridges become outcrops.
    const v = Math.abs(n); // ~[0, 0.8]
    const t = (v - 0.35) / 0.3;
    return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
  }

  // Berry patch density — single mid-frequency octave, less strict threshold
  // than forests so patches appear frequently but still cluster.
  function berryDensity(x, y) {
    const n = seamless(berryNoise.noise, x, y, BERRY_FREQ, BERRY_FREQ);
    const v = n * 0.6 + 0.5; // remap ~[-0.5, 0.95] -> ~[0.2, 0.98]
    const t = (v - 0.45) / 0.25;
    return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
  }

  function generateChunk(cx, cy) {
    const key = `${cx},${cy}`;
    const cached = byChunk.get(key);
    if (cached) return cached.objects;

    const baseX = cx * chunkSize;
    const baseY = cy * chunkSize;
    const objects = [];

    // --- Trees ---
    // Two uniform rolls pick a candidate position; a third roll gates it
    // against the forest density field so candidates outside groves are
    // rejected. Terrain rules still apply as a hard filter.
    const rngT = splitmix32(hashChunk(seed ^ 0x7f4a7c15, cx, cy));
    for (let i = 0; i < TREE_CANDIDATES_PER_CHUNK; i++) {
      const lx = Math.floor(rngT() * chunkSize);
      const ly = Math.floor(rngT() * chunkSize);
      const gate = rngT();
      const x = baseX + lx;
      const y = baseY + ly;
      const d = forestDensity(x, y);
      if (d <= 0 || gate > d) continue;
      const cell = terrain.cellAt(x, y);
      if (!acceptTree(cell, config)) continue;
      const id = `t-${cx}-${cy}-${i}`;
      objects.push({ id, type: 'tree', x, y });
    }

    // --- Rocks ---
    const rngR = splitmix32(hashChunk(seed ^ 0x94d049bb, cx, cy));
    for (let i = 0; i < ROCK_CANDIDATES_PER_CHUNK; i++) {
      const lx = Math.floor(rngR() * chunkSize);
      const ly = Math.floor(rngR() * chunkSize);
      const gate = rngR();
      const x = baseX + lx;
      const y = baseY + ly;
      const d = outcropDensity(x, y);
      if (d <= 0 || gate > d) continue;
      const cell = terrain.cellAt(x, y);
      if (!acceptRock(cell, config)) continue;
      const id = `r-${cx}-${cy}-${i}`;
      objects.push({ id, type: 'rock', x, y });
    }

    // --- Food (berry bushes) ---
    // Clustered by their own berry-density field into patches; then filtered
    // to open/forest-floor ground so they avoid tall grass and mud flats.
    const rngF = splitmix32(hashChunk(seed ^ 0x5a827999, cx, cy));
    for (let i = 0; i < FOOD_CANDIDATES_PER_CHUNK; i++) {
      const lx = Math.floor(rngF() * chunkSize);
      const ly = Math.floor(rngF() * chunkSize);
      const gate = rngF();
      const x = baseX + lx;
      const y = baseY + ly;
      const d = berryDensity(x, y);
      if (d <= 0 || gate > d) continue;
      const cell = terrain.cellAt(x, y);
      if (!acceptFood(cell, config)) continue;
      // Apply altitude bias
      const altBias = altitudeBias(cell.height, altitude.foodAltitudeBiasStrength, altitude.preferredAltitudeMax);
      if (rngF() > altBias) continue;
      objects.push({ id: `f-${cx}-${cy}-${i}`, type: 'food', x, y });
    }

    // --- Water sources ---
    // No density field: shorelines are already a natural clustering feature.
    // We sample uniformly and rely on terrain acceptance to pick edge cells.
    const rngW = splitmix32(hashChunk(seed ^ 0x6ed9eba1, cx, cy));
    for (let i = 0; i < WATER_CANDIDATES_PER_CHUNK; i++) {
      const lx = Math.floor(rngW() * chunkSize);
      const ly = Math.floor(rngW() * chunkSize);
      const x = baseX + lx;
      const y = baseY + ly;
      const cell = terrain.cellAt(x, y);
      if (!acceptWater(cell)) continue;
      objects.push({ id: `w-${cx}-${cy}-${i}`, type: 'water_source', x, y });
    }

    // --- Rest spots ---
    // Only in dense forest interior (forestDensity > 0.55) on walkable ground.
    const rngRS = splitmix32(hashChunk(seed ^ 0x8f1bbcdc, cx, cy));
    for (let i = 0; i < REST_CANDIDATES_PER_CHUNK; i++) {
      const lx = Math.floor(rngRS() * chunkSize);
      const ly = Math.floor(rngRS() * chunkSize);
      const gate = rngRS();
      const x = baseX + lx;
      const y = baseY + ly;
      const d = forestDensity(x, y);
      if (d < 0.55 || gate > d) continue;
      const cell = terrain.cellAt(x, y);
      if (!acceptRest(cell)) continue;
      // Apply altitude bias
      const altBias = altitudeBias(cell.height, altitude.restAltitudeBiasStrength, altitude.preferredAltitudeMax);
      if (rngRS() > altBias) continue;
      objects.push({ id: `rs-${cx}-${cy}-${i}`, type: 'rest_spot', x, y });
    }

    // Register with chunk index + id map.
    for (const obj of objects) {
      byId.set(obj.id, obj);
      chunkIndex.addObjectId(cx, cy, obj.id);
    }
    byChunk.set(key, { objects, generated: true });
    return objects;
  }

  function getObjectsInChunk(cx, cy) {
    return generateChunk(cx, cy);
  }

  // Query objects whose position lies inside a possibly wrap-crossing rect.
  // x,y,w,h are in world cells (integer). typesSet filters type strings;
  // if null, all types are returned.
  function queryRect(x, y, w, h, typesSet) {
    const chunks = chunkIndex.chunksInRect(x, y, w, h);
    const out = [];
    const W = config.width;
    const H = config.height;

    // To test containment with wrap, normalise object coords into offsets
    // relative to (x,y) using modular arithmetic.
    for (const { cx, cy } of chunks) {
      const objs = getObjectsInChunk(cx, cy);
      for (const obj of objs) {
        if (typesSet && !typesSet.has(obj.type)) continue;
        // Map obj.x,obj.y into the same "window" as the query rect.
        let dx = obj.x - x;
        dx = ((dx % W) + W) % W;
        let dy = obj.y - y;
        dy = ((dy % H) + H) % H;
        if (dx < w && dy < h) {
          out.push(obj);
        }
      }
      // Dynamic food lives in the chunk index under objectIds but not in
      // the per-chunk static object list; iterate the chunk's objectIds to
      // find them.
      const chunk = chunkIndex.getChunk(cx, cy);
      for (const id of chunk.objectIds) {
        const dyn = dynamicFood.get(id);
        if (!dyn) continue;
        if (typesSet && !typesSet.has(dyn.type)) continue;
        let dx = dyn.x - x;
        dx = ((dx % W) + W) % W;
        let dy = dyn.y - y;
        dy = ((dy % H) + H) % H;
        if (dx < w && dy < h) {
          out.push({ id: dyn.id, type: dyn.type, x: dyn.x, y: dyn.y });
        }
      }
    }
    return out;
  }

  function getById(id) {
    return byId.get(id) || null;
  }

  // --- Food depletion helpers ---

  // Returns true if the food node is currently harvestable (has stock
  // remaining). Non-food ids are always considered available.
  function isAvailable(id, tick) {
    const obj = byId.get(id);
    if (!obj || obj.type !== 'food') return true;
    if (!regrowsAt.has(id)) return true;
    return (regrowsAt.get(id) | 0) <= tick;
  }

  // Called once when an agent finishes an eat action. Decrements stock and
  // schedules regrowth when the last stock is consumed.
  function consumeFood(id, tick) {
    const obj = byId.get(id);
    if (!obj || obj.type !== 'food') return;
    const current = foodStock.has(id) ? foodStock.get(id) : survival.foodStock;
    const next = current - 1;
    if (next <= 0) {
      foodStock.set(id, 0);
      regrowsAt.set(id, tick + survival.foodRegrowTicks);
    } else {
      foodStock.set(id, next);
    }
  }

  // Count food nodes (static + dynamic, excluding depleted) within radius
  // of a point. Used for the local density cap when spreading.
  function countFoodWithinRadius(x, y, radius, tick) {
    const side = Math.ceil(radius * 2) + 2;
    const rx = Math.floor(x - radius - 1);
    const ry = Math.floor(y - radius - 1);
    const found = queryRect(rx, ry, side, side, new Set(['food']));
    let n = 0;
    for (const o of found) {
      if (!isAvailable(o.id, tick)) continue;
      if (wrappedDistance(x, y, o.x, o.y, width, height) <= radius) n++;
    }
    return n;
  }

  // Spawn a new dynamic food node near (srcX, srcY). Returns the created
  // node or null if the attempt was rejected (off-terrain / density cap).
  function trySpreadFood(srcX, srcY, tick) {
    const radius = survival.foodSpreadRadius;
    // Pick a random point inside a disc of the spread radius.
    const angle = spreadRng() * Math.PI * 2;
    const dist = Math.sqrt(spreadRng()) * radius;
    const nxRaw = srcX + Math.cos(angle) * dist;
    const nyRaw = srcY + Math.sin(angle) * dist;
    const nx = ((Math.round(nxRaw) % width) + width) % width;
    const ny = ((Math.round(nyRaw) % height) + height) % height;
    if (nx === srcX && ny === srcY) return null;

    const cell = terrain.cellAt(nx, ny);
    if (!acceptFood(cell, config)) return null;

    // Density cap — avoid piling new nodes onto crowded areas.
    if (countFoodWithinRadius(nx, ny, survival.foodDensityRadius, tick) >= survival.foodDensityMax) {
      return null;
    }

    dynamicCounter += 1;
    const id = `fd-${dynamicCounter}`;
    const cx = Math.floor(nx / chunkSize);
    const cy = Math.floor(ny / chunkSize);
    const node = { id, type: 'food', x: nx, y: ny, cx, cy };
    dynamicFood.set(id, node);
    byId.set(id, { id, type: 'food', x: nx, y: ny });
    chunkIndex.addObjectId(cx, cy, id);
    return node;
  }

  // Called every tick: recover food nodes whose regrowth timer has elapsed.
  // On recovery each node also tries to spawn one child (on-regrowth spread).
  function tickRegrowth(tick) {
    if (regrowsAt.size === 0) return;
    const toClear = [];
    for (const [id, when] of regrowsAt) {
      if (when <= tick) toClear.push(id);
    }
    for (const id of toClear) {
      regrowsAt.delete(id);
      foodStock.set(id, survival.foodStock);
      const src = byId.get(id);
      if (src) trySpreadFood(src.x, src.y, tick);
    }
  }

  // Called periodically (tick % foodSpreadInterval === 0): every active
  // food node has a small chance to spawn a child nearby.
  function tickFoodSpread(tick) {
    if (survival.foodSpreadInterval <= 0) return;
    if (tick % survival.foodSpreadInterval !== 0) return;
    if (survival.foodSpreadChance <= 0) return;

    // Iterate static food nodes via byId (they were registered when their
    // owning chunk was first generated) and all dynamic nodes.
    for (const [id, obj] of byId) {
      if (obj.type !== 'food') continue;
      if (!isAvailable(id, tick)) continue;
      if (spreadRng() >= survival.foodSpreadChance) continue;
      trySpreadFood(obj.x, obj.y, tick);
    }
  }

  // Debug helper: snapshot depletion state for a single food node.
  function getFoodState(id, tick) {
    const obj = byId.get(id);
    if (!obj || obj.type !== 'food') return null;
    const depleted = regrowsAt.has(id);
    return {
      id,
      stock: foodStock.has(id) ? foodStock.get(id) : survival.foodStock,
      depleted,
      regrowsAt: depleted ? regrowsAt.get(id) : null,
      ticksUntilRegrow: depleted ? Math.max(0, regrowsAt.get(id) - tick) : 0,
      dynamic: dynamicFood.has(id),
    };
  }

  // --- Resource queuing functions ---

  // Check if a resource has agents waiting in queue
  function getQueueLength(resourceId) {
    const queue = resourceQueues.get(resourceId);
    return queue ? queue.length : 0;
  }

  // Add agent to resource queue
  function joinQueue(agentId, resourceId) {
    if (!resourceQueues.has(resourceId)) {
      resourceQueues.set(resourceId, []);
    }
    const queue = resourceQueues.get(resourceId);
    if (!queue.includes(agentId)) {
      queue.push(agentId);
      agentWaitingFor.set(agentId, resourceId);
    }
  }

  // Remove agent from resource queue
  function leaveQueue(agentId) {
    const resourceId = agentWaitingFor.get(agentId);
    if (resourceId) {
      const queue = resourceQueues.get(resourceId);
      if (queue) {
        const index = queue.indexOf(agentId);
        if (index !== -1) {
          queue.splice(index, 1);
        }
      }
      agentWaitingFor.delete(agentId);
    }
  }

  // Get the next agent in queue for a resource
  function getNextInQueue(resourceId) {
    const queue = resourceQueues.get(resourceId);
    return queue && queue.length > 0 ? queue[0] : null;
  }

  // Check if agent is at front of queue
  function isAtFrontOfQueue(agentId, resourceId) {
    const queue = resourceQueues.get(resourceId);
    return queue && queue.length > 0 && queue[0] === agentId;
  }

  return {
    getObjectsInChunk,
    queryRect,
    getById,
    isAvailable,
    consumeFood,
    tickRegrowth,
    tickFoodSpread,
    getFoodState,
    getQueueLength,
    joinQueue,
    leaveQueue,
    getNextInQueue,
    isAtFrontOfQueue,
  };
}

module.exports = { createObjectStore };
