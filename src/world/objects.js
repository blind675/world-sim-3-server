'use strict';

// Deterministic static object store for Phase 2.
//
// Objects (trees, rocks) are generated lazily per chunk from a seeded PRNG.
// Same world seed + same chunk coords always produce the same objects, so
// no persistence is needed. Generation registers object ids with the chunk
// index on first access and caches the result.

const { splitmix32 } = require('../utils/prng');
const { createPerlin4D } = require('./perlin');

// Candidate counts per 128x128 chunk. We sample more candidates than Phase 2a
// because each one also has to pass a low-frequency density field (forest /
// outcrop mask), which rejects most candidates outside clusters.
const TREE_CANDIDATES_PER_CHUNK = 360;
const ROCK_CANDIDATES_PER_CHUNK = 140;
const FOOD_CANDIDATES_PER_CHUNK = 60;
const WATER_CANDIDATES_PER_CHUNK = 50;
const REST_CANDIDATES_PER_CHUNK = 25;

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

function acceptTree(cell) {
  return cell.height > 2 && TREE_GROUND.has(cell.groundType);
}
function acceptRock(cell) {
  if (cell.groundType === 'rock') return true;
  if (cell.height > 25) return true;
  return false;
}
function acceptFood(cell) {
  return cell.height > 1 && FOOD_GROUND.has(cell.groundType);
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
  // chunkKey -> { objects: [...], generated: true }
  const byChunk = new Map();
  // id -> object
  const byId = new Map();

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
      if (!acceptTree(cell)) continue;
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
      if (!acceptRock(cell)) continue;
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
      if (!acceptFood(cell)) continue;
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
    }
    return out;
  }

  function getById(id) {
    return byId.get(id) || null;
  }

  return {
    getObjectsInChunk,
    queryRect,
    getById,
  };
}

module.exports = { createObjectStore };
