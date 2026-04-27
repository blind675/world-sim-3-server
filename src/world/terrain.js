'use strict';

// Wrapped low-relief terrain sampler.
// Height sampled on demand; no full 5120x5120 heightmap kept in memory.

const { createPerlin4D } = require('./perlin');

const TWO_PI = Math.PI * 2;

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

function createTerrain(config) {
  const { width, height, seed, terrain } = config;
  const { minHeight, maxHeight, seaLevel } = terrain;

  // Independent noise layers for octaves and derivations.
  const base = createPerlin4D(seed ^ 0x9e3779b1);
  const detail = createPerlin4D(seed ^ 0x85ebca77);
  const ridge = createPerlin4D(seed ^ 0xc2b2ae35);

  // Frequencies expressed as INTEGER cycles per world. This is critical for
  // a seamless wrap: the 4D-torus mapping is only truly periodic when each
  // octave completes a whole number of cycles across the world size.
  // (Non-integer cycle counts cause a visible seam at x=0 and y=0.)
  //
  // With width=5120 the feature sizes are approximately:
  //   5  cycles -> 1280 m features (broad hills/basins)
  //   8  cycles ->  640 m features (local ridges) - reduced from 10
  //   16 cycles ->  320 m features (surface roughness) - reduced from 32
  //   5  cycles (ridge) -> 1024 m features - reduced from 6
  const fLarge = 5;
  const fMid = 8;
  const fFine = 16;
  const fRidge = 5;

  // Precomputed 2pi/size
  const kx = TWO_PI / width;
  const ky = TWO_PI / height;

  // Sample one octave of seamless noise at 2D position (x,y) with frequency fx,fy
  // (cycles per world). Map x -> (cos(kx*x*fx), sin(kx*x*fx)) and similarly for y.
  function seamless(noiseFn, x, y, fx, fy) {
    const ax = kx * x * fx;
    const ay = ky * y * fy;
    return noiseFn(
      Math.cos(ax),
      Math.sin(ax),
      Math.cos(ay),
      Math.sin(ay),
    );
  }

  // Normalized base height in [0,1] built from 3 octaves + subtle ridge detail.
  // Tuned so roughly: ~25% below sea level (shallow basins),
  // ~50% gentle lowland, ~25% hills, rare peaks.
  function baseNorm(x, y) {
    const n1 = seamless(base.noise, x, y, fLarge, fLarge);          // ~ [-0.7,0.7]
    const n2 = seamless(detail.noise, x, y, fMid, fMid);
    const n3 = seamless(detail.noise, x, y, fFine, fFine);
    const nr = seamless(ridge.noise, x, y, fRidge, fRidge);

    // Octaves weighted so large shapes dominate. Keep total amplitude modest so
    // per-cell slopes stay gentle on a 1m-cell world. Perlin4D peaks near ±0.7.
    // Reduced higher frequency contributions for smoother terrain.
    const sum = n1 * 0.88 + n2 * 0.10 + n3 * 0.02;
    const ridged = (0.5 - Math.abs(nr)) * 0.10;
    const combined = sum + ridged;

    // Centered distribution with small downward bias so ~20% is below sea level.
    // combined has typical range ~[-0.9, 0.9]; widen slightly and clamp tails.
    return clamp(0.58 * combined + 0.38, 0, 1);
  }

  function heightAt(x, y) {
    const n = baseNorm(x, y);
    return minHeight + n * (maxHeight - minHeight);
  }

  // Approximate slope via central differences (in meters per meter = unitless).
  function slopeAt(x, y) {
    const dx = heightAt(x + 1, y) - heightAt(x - 1, y);
    const dy = heightAt(x, y + 1) - heightAt(x, y - 1);
    // cellSize = 1, step = 2 cells
    return Math.sqrt(dx * dx + dy * dy) / 2;
  }

  // Ground classification using clear altitude bands with slope as secondary modifier.
  // Altitude determines the base biome, slope can override with rock/tall_grass.
  function groundTypeAt(x, y, h) {
    const height = (h === undefined) ? heightAt(x, y) : h;
    const s = slopeAt(x, y);

    // Water zones (altitude-based)
    if (height < seaLevel - 2) return 'deep_water';
    if (height < seaLevel) return 'shallow_water';
    if (height < seaLevel + 0.8) return 'mud';

    // Really high altitude zones (above 90% of max height)
    if (height > maxHeight * 0.90) {
      return 'rock';                         // Pure rock zones
    }

    // High altitude zones (above 75% of max height ≈ 60m+)
    if (height > maxHeight * 0.75) {
      if (s > 0.4) return 'rock';           // Steep slopes become rock
      return 'short_grass';                  // High meadows (short grass due to strong winds)
    }

    // Mid altitude zones (sea level + 10m to 60m)
    if (height > seaLevel + 10) {
      if (s > 0.6) return 'rock';           // Steep slopes become rock
      if (s > 0.30) return 'tall_grass';    // Moderate slopes become tall grass
      return 'forest_floor';                 // Forest areas on gentle terrain
    }

    // Low altitude zones (sea level + 0.8m to 10m)
    if (s > 0.8) return 'rock';             // Extreme slopes become rock
    if (s > 0.2) return 'tall_grass';      // Moderate slopes become tall grass
    if (s > 0.15) return 'short_grass';    // Gentle slopes become short grass
    return 'ground';                        // Flat lowland terrain
  }

  const MOVE_COST = Object.freeze({
    ground: 1.0,
    short_grass: 1.1,
    tall_grass: 1.3,
    forest_floor: 1.2,
    mud: 1.8,
    rock: 1.6,
    shallow_water: 2.4,
    deep_water: Infinity,
  });

  const VISION_BLOCK = Object.freeze({
    ground: false,
    short_grass: false,
    tall_grass: false,
    forest_floor: false,
    mud: false,
    rock: true,
    shallow_water: false,
    deep_water: false,
  });

  function waterDepthAt(x, y, h) {
    const height = (h === undefined) ? heightAt(x, y) : h;
    const d = seaLevel - height;
    return d > 0 ? d : 0;
  }

  function cellAt(x, y) {
    const h = heightAt(x, y);
    const g = groundTypeAt(x, y, h);
    return {
      height: h,
      groundType: g,
      waterDepth: waterDepthAt(x, y, h),
      baseMoveCost: MOVE_COST[g],
      blocksVision: VISION_BLOCK[g],
    };
  }

  // Batch generate all requested layers for a chunk in a single pass
  function generateChunkLayers(baseX, baseY, chunkSize, requestedLayers) {
    const N = chunkSize * chunkSize;
    const layers = {};

    // Pre-allocate arrays for requested layers
    if (requestedLayers.includes('height')) {
      layers.height = new Float32Array(N);
    }
    if (requestedLayers.includes('groundType')) {
      layers.groundType = new Array(N);
    }
    if (requestedLayers.includes('waterDepth')) {
      layers.waterDepth = new Float32Array(N);
    }
    if (requestedLayers.includes('moveCost')) {
      layers.moveCost = new Float32Array(N);
    }
    if (requestedLayers.includes('blocksVision')) {
      layers.blocksVision = new Uint8Array(N);
    }

    // Generate all layers in a single pass
    for (let j = 0; j < chunkSize; j++) {
      const wy = baseY + j;
      for (let i = 0; i < chunkSize; i++) {
        const wx = baseX + i;
        const idx = j * chunkSize + i;

        // Calculate values once per cell
        const h = heightAt(wx, wy);
        const g = groundTypeAt(wx, wy, h);
        const waterDepth = waterDepthAt(wx, wy, h);
        const moveCost = MOVE_COST[g];
        const blocksVision = VISION_BLOCK[g];

        // Store in requested arrays
        if (layers.height) layers.height[idx] = h;
        if (layers.groundType) layers.groundType[idx] = g;
        if (layers.waterDepth) layers.waterDepth[idx] = waterDepth;
        if (layers.moveCost) layers.moveCost[idx] = moveCost === Infinity ? -1 : moveCost;
        if (layers.blocksVision) layers.blocksVision[idx] = blocksVision ? 1 : 0;
      }
    }

    return layers;
  }

  // Calculate movement cost including altitude penalties/bonuses
  function moveCostWithAltitude(fromX, fromY, toX, toY, altitudeConfig) {
    const fromCell = cellAt(fromX, fromY);
    const toCell = cellAt(toX, toY);

    // Base cost from terrain type
    const baseCost = toCell.baseMoveCost;
    if (!Number.isFinite(baseCost)) return Infinity;

    // Calculate altitude difference
    const heightDiff = toCell.height - fromCell.height;
    const { uphillPenaltyMultiplier, downhillBonusMultiplier, altitudeDiffThreshold } = altitudeConfig;

    // Apply altitude modifier if difference exceeds threshold
    let multiplier = 1.0;
    if (heightDiff > altitudeDiffThreshold) {
      multiplier = uphillPenaltyMultiplier;
    } else if (heightDiff < -altitudeDiffThreshold) {
      multiplier = downhillBonusMultiplier;
    }

    return baseCost * multiplier;
  }

  return Object.freeze({
    heightAt,
    slopeAt,
    groundTypeAt,
    waterDepthAt,
    cellAt,
    generateChunkLayers,
    moveCostWithAltitude,
    constants: { MOVE_COST, VISION_BLOCK },
  });
}

module.exports = { createTerrain };
