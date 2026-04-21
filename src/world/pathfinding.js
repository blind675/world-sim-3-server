'use strict';

// Wrap-aware 4-directional A* on the world grid.
//
// Cost per move = baseMoveCost of the destination cell. Impassable cells
// (deep_water or waterDepth > threshold) are skipped. Coordinates are
// integers in [0,width) x [0,height); neighbours use modular wrap.
//
// Heuristic: wrapped Manhattan distance (admissible for 4-dir unit grids).

const { wrap } = require('../utils/wrap');

// Minimal binary min-heap keyed by numeric `.f`. Small and allocation-light.
function createHeap() {
  const a = [];
  return {
    size: () => a.length,
    push(n) {
      a.push(n);
      let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (a[p].f <= a[i].f) break;
        const t = a[p]; a[p] = a[i]; a[i] = t;
        i = p;
      }
    },
    pop() {
      const top = a[0];
      const last = a.pop();
      if (a.length > 0) {
        a[0] = last;
        let i = 0;
        while (true) {
          const l = 2 * i + 1;
          const r = 2 * i + 2;
          let m = i;
          if (l < a.length && a[l].f < a[m].f) m = l;
          if (r < a.length && a[r].f < a[m].f) m = r;
          if (m === i) break;
          const t = a[m]; a[m] = a[i]; a[i] = t;
          i = m;
        }
      }
      return top;
    },
  };
}

// Wrapped Manhattan distance on a torus of size (W,H).
function wrappedManhattan(ax, ay, bx, by, W, H) {
  let dx = Math.abs(ax - bx);
  let dy = Math.abs(ay - by);
  if (dx > W / 2) dx = W - dx;
  if (dy > H / 2) dy = H - dy;
  return dx + dy;
}

// Signed shortest delta on a torus axis. Used to determine whether a move
// crosses the wrap seam so we can serialise paths correctly for the client.
function shortestDelta(a, b, size) {
  let d = b - a;
  if (d > size / 2) d -= size;
  else if (d < -size / 2) d += size;
  return d;
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function isBlocked(cell, deepWaterThreshold) {
  if (!cell) return true;
  if (cell.groundType === 'deep_water') return true;
  if (cell.waterDepth > deepWaterThreshold) return true;
  if (!Number.isFinite(cell.baseMoveCost)) return true;
  return false;
}

function cellKey(x, y, W) {
  return y * W + x;
}

// Returns an array of { x, y } cells (excluding start) to walk, or null.
function findPath(world, start, goal, opts = {}) {
  const { config, terrain } = world;
  const W = config.width;
  const H = config.height;
  const deepWaterThreshold = config.agents.deepWaterThreshold;
  const maxNodes = opts.maxNodes || 200000;

  const sx = wrap(start.x | 0, W);
  const sy = wrap(start.y | 0, H);
  const gx = wrap(goal.x | 0, W);
  const gy = wrap(goal.y | 0, H);

  if (sx === gx && sy === gy) return [];

  // Goal must be reachable (walkable).
  const goalCell = terrain.cellAt(gx, gy);
  if (isBlocked(goalCell, deepWaterThreshold)) return null;

  const startKey = cellKey(sx, sy, W);
  const goalKey = cellKey(gx, gy, W);

  const gScore = new Map();
  const cameFrom = new Map();
  gScore.set(startKey, 0);

  const open = createHeap();
  open.push({ x: sx, y: sy, key: startKey, f: wrappedManhattan(sx, sy, gx, gy, W, H) });

  let expanded = 0;
  while (open.size() > 0) {
    const cur = open.pop();
    if (cur.key === goalKey) {
      // Reconstruct path (cells only, excluding start).
      const out = [];
      let k = goalKey;
      let cx = gx, cy = gy;
      while (k !== startKey) {
        out.push({ x: cx, y: cy });
        const prev = cameFrom.get(k);
        if (!prev) return null; // defensive
        k = prev.key;
        cx = prev.x;
        cy = prev.y;
      }
      out.reverse();
      return out;
    }

    expanded++;
    if (expanded > maxNodes) return null;

    const curG = gScore.get(cur.key);
    for (const [dx, dy] of DIRS) {
      const nx = wrap(cur.x + dx, W);
      const ny = wrap(cur.y + dy, H);
      const nk = cellKey(nx, ny, W);
      const ncell = terrain.cellAt(nx, ny);
      if (isBlocked(ncell, deepWaterThreshold)) continue;
      const tentative = curG + ncell.baseMoveCost;
      const prevG = gScore.get(nk);
      if (prevG !== undefined && tentative >= prevG) continue;
      gScore.set(nk, tentative);
      cameFrom.set(nk, { key: cur.key, x: cur.x, y: cur.y });
      const f = tentative + wrappedManhattan(nx, ny, gx, gy, W, H);
      open.push({ x: nx, y: ny, key: nk, f });
    }
  }
  return null;
}

module.exports = { findPath, wrappedManhattan, shortestDelta };
