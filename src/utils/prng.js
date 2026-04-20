'use strict';

// splitmix32 — deterministic, seedable 32-bit PRNG returning [0,1).
function splitmix32(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    z ^= z >>> 16;
    return (z >>> 0) / 4294967296;
  };
}

function createRng(seed) {
  return splitmix32(seed >>> 0);
}

module.exports = { createRng, splitmix32 };
