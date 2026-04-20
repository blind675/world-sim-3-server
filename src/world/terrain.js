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
  //   4  cycles -> 1280 m features (broad hills/basins)
  //   10 cycles ->  512 m features (local ridges)
  //   32 cycles ->  160 m features (surface roughness)
  //   6  cycles (ridge) -> ~853 m features
  const fLarge = 4;
  const fMid = 10;
  const fFine = 32;
  const fRidge = 6;

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
    const sum = n1 * 0.82 + n2 * 0.22 + n3 * 0.06;
    const ridged = (0.5 - Math.abs(nr)) * 0.18;
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

  // Ground classification using height + slope bands.
  // Kept intentionally simple for Phase 1; richer biomes come later.
  function groundTypeAt(x, y, h) {
    const height = (h === undefined) ? heightAt(x, y) : h;
    if (height < seaLevel - 2) return 'deep_water';
    if (height < seaLevel) return 'shallow_water';
    if (height < seaLevel + 0.8) return 'mud';

    // Slope thresholds calibrated to the realised slope distribution
    // (p50 ≈ 0.2, p90 ≈ 0.45, p99 ≈ 0.6 m/cell).
    const s = slopeAt(x, y);
    if (s > 0.55) return 'rock';
    if (height > maxHeight * 0.85 && s > 0.35) return 'rock';
    if (s > 0.35) return 'tall_grass';
    if (height > seaLevel + 35) return 'forest_floor';
    if (height > seaLevel + 10) {
      return s > 0.18 ? 'tall_grass' : 'forest_floor';
    }
    if (s > 0.18) return 'tall_grass';
    return 'ground';
  }

  const MOVE_COST = Object.freeze({
    ground: 1.0,
    tall_grass: 1.3,
    forest_floor: 1.2,
    mud: 1.8,
    rock: 1.6,
    shallow_water: 2.4,
    deep_water: Infinity,
  });

  const VISION_BLOCK = Object.freeze({
    ground: false,
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

  return {
    heightAt,
    slopeAt,
    groundTypeAt,
    waterDepthAt,
    cellAt,
    constants: { MOVE_COST, VISION_BLOCK },
  };
}

module.exports = { createTerrain };
