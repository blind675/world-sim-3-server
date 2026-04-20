'use strict';

// 4D Perlin noise.
// Used to build a seamlessly-wrapped 2D field: the 2D domain (x,y) in [0,W)x[0,H)
// is mapped onto two circles in 4D, giving exact periodicity on both axes.

const { createRng } = require('../utils/prng');

function buildPermutation(seed) {
  const rng = createRng(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  return perm;
}

// 32 evenly distributed gradients on the 4D unit lattice (+/- 1 combos with a zero).
const GRAD4 = new Int8Array([
  0, 1, 1, 1,   0, 1, 1,-1,   0, 1,-1, 1,   0, 1,-1,-1,
  0,-1, 1, 1,   0,-1, 1,-1,   0,-1,-1, 1,   0,-1,-1,-1,
  1, 0, 1, 1,   1, 0, 1,-1,   1, 0,-1, 1,   1, 0,-1,-1,
 -1, 0, 1, 1,  -1, 0, 1,-1,  -1, 0,-1, 1,  -1, 0,-1,-1,
  1, 1, 0, 1,   1, 1, 0,-1,   1,-1, 0, 1,   1,-1, 0,-1,
 -1, 1, 0, 1,  -1, 1, 0,-1,  -1,-1, 0, 1,  -1,-1, 0,-1,
  1, 1, 1, 0,   1, 1,-1, 0,   1,-1, 1, 0,   1,-1,-1, 0,
 -1, 1, 1, 0,  -1, 1,-1, 0,  -1,-1, 1, 0,  -1,-1,-1, 0,
]);

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a, b, t) { return a + t * (b - a); }

function grad4(perm, ix, iy, iz, iw, dx, dy, dz, dw) {
  const h =
    perm[(ix + perm[(iy + perm[(iz + perm[iw & 255]) & 255]) & 255]) & 255] & 31;
  const g = h << 2;
  return GRAD4[g] * dx + GRAD4[g + 1] * dy + GRAD4[g + 2] * dz + GRAD4[g + 3] * dw;
}

function createPerlin4D(seed) {
  const perm = buildPermutation(seed);

  function noise(x, y, z, w) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), wi = Math.floor(w);
    const xf = x - xi, yf = y - yi, zf = z - zi, wf = w - wi;
    const u = fade(xf), v = fade(yf), s = fade(zf), t = fade(wf);

    const ix = xi & 255, iy = yi & 255, iz = zi & 255, iw = wi & 255;
    const ix1 = (xi + 1) & 255, iy1 = (yi + 1) & 255, iz1 = (zi + 1) & 255, iw1 = (wi + 1) & 255;

    // 16 corner contributions
    const n0000 = grad4(perm, ix,  iy,  iz,  iw,  xf,     yf,     zf,     wf);
    const n1000 = grad4(perm, ix1, iy,  iz,  iw,  xf - 1, yf,     zf,     wf);
    const n0100 = grad4(perm, ix,  iy1, iz,  iw,  xf,     yf - 1, zf,     wf);
    const n1100 = grad4(perm, ix1, iy1, iz,  iw,  xf - 1, yf - 1, zf,     wf);
    const n0010 = grad4(perm, ix,  iy,  iz1, iw,  xf,     yf,     zf - 1, wf);
    const n1010 = grad4(perm, ix1, iy,  iz1, iw,  xf - 1, yf,     zf - 1, wf);
    const n0110 = grad4(perm, ix,  iy1, iz1, iw,  xf,     yf - 1, zf - 1, wf);
    const n1110 = grad4(perm, ix1, iy1, iz1, iw,  xf - 1, yf - 1, zf - 1, wf);
    const n0001 = grad4(perm, ix,  iy,  iz,  iw1, xf,     yf,     zf,     wf - 1);
    const n1001 = grad4(perm, ix1, iy,  iz,  iw1, xf - 1, yf,     zf,     wf - 1);
    const n0101 = grad4(perm, ix,  iy1, iz,  iw1, xf,     yf - 1, zf,     wf - 1);
    const n1101 = grad4(perm, ix1, iy1, iz,  iw1, xf - 1, yf - 1, zf,     wf - 1);
    const n0011 = grad4(perm, ix,  iy,  iz1, iw1, xf,     yf,     zf - 1, wf - 1);
    const n1011 = grad4(perm, ix1, iy,  iz1, iw1, xf - 1, yf,     zf - 1, wf - 1);
    const n0111 = grad4(perm, ix,  iy1, iz1, iw1, xf,     yf - 1, zf - 1, wf - 1);
    const n1111 = grad4(perm, ix1, iy1, iz1, iw1, xf - 1, yf - 1, zf - 1, wf - 1);

    // Trilinear + w blend
    const x00 = lerp(lerp(n0000, n1000, u), lerp(n0100, n1100, u), v);
    const x01 = lerp(lerp(n0010, n1010, u), lerp(n0110, n1110, u), v);
    const x10 = lerp(lerp(n0001, n1001, u), lerp(n0101, n1101, u), v);
    const x11 = lerp(lerp(n0011, n1011, u), lerp(n0111, n1111, u), v);

    const z0 = lerp(x00, x01, s);
    const z1 = lerp(x10, x11, s);

    // Perlin 4D output is roughly in [-~1.0, ~1.0] after this, but safer to keep raw.
    return lerp(z0, z1, t);
  }

  return { noise };
}

module.exports = { createPerlin4D };
