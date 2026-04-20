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

module.exports = { wrap, wrapX, wrapY, chunkCoord, localInChunk, wrappedDistance };
