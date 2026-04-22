'use strict';

function wrap(value, size) {
  const v = value % size;
  return v < 0 ? v + size : v;
}

function wrapX(x, width) {
  return wrap(x | 0, width);
}

function wrapY(y, height) {
  return wrap(y | 0, height);
}

function chunkCoord(x, y, chunkSize) {
  return { cx: Math.floor(x / chunkSize), cy: Math.floor(y / chunkSize) };
}

function localInChunk(x, y, chunkSize) {
  const lx = ((x % chunkSize) + chunkSize) % chunkSize;
  const ly = ((y % chunkSize) + chunkSize) % chunkSize;
  return { lx, ly };
}

// Shortest toroidal distance between two points.
function wrappedDistance(ax, ay, bx, by, width, height) {
  let dx = Math.abs(ax - bx);
  let dy = Math.abs(ay - by);
  if (dx > width / 2) dx = width - dx;
  if (dy > height / 2) dy = height - dy;
  return Math.sqrt(dx * dx + dy * dy);
}

// Signed shortest delta on a torus axis: returns b-a reduced to (-size/2, size/2].
// Useful when you need a direction, not just a magnitude (e.g. centroid math
// across the wrap seam, facing calculations). Matches perception.js semantics.
function shortestDelta(a, b, size) {
  let d = b - a;
  if (d > size / 2) d -= size;
  else if (d < -size / 2) d += size;
  return d;
}

module.exports = {
  wrap,
  wrapX,
  wrapY,
  chunkCoord,
  localInChunk,
  wrappedDistance,
  shortestDelta,
};
