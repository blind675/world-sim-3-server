'use strict';

// Per-agent perception for Milestone 4.
//
// perceiveAgent(world, agent) returns the list of entities currently visible
// to the agent, subject to:
//   - a front cone of configured aperture centered on the agent's facing,
//   - a short omnidirectional near-field radius,
//   - line-of-sight gated by cell-level `blocksVision` (e.g. rock ground)
//     plus "opaque" object occlusion (trees, rocks).
//
// Designed to be pure: given the same world state + agent state it must
// always produce the same output. No Math.random / Date.now usage.

const { wrap } = require('../utils/wrap');

// Object types that block line-of-sight when they sit on an intermediate
// cell between the observer and the target. Trees + rocks are opaque.
// Agents do NOT block vision here — they're too small relative to the cell.
const OPAQUE_OBJECT_TYPES = new Set(['tree', 'rock']);

// Returns signed shortest delta on a torus axis, so facing/angle math is
// consistent across the wrap seam.
function shortestDelta(a, b, size) {
  let d = b - a;
  if (d > size / 2) d -= size;
  else if (d < -size / 2) d += size;
  return d;
}

// Is candidate (cx,cy) inside the agent's vision envelope?
// Returns { visible: boolean, distance: number, inNear: boolean } with the
// signed deltas used for later callers if needed.
function withinEnvelope(agent, cx, cy, width, height, perceptionCfg) {
  const dx = shortestDelta(agent.x, cx, width);
  const dy = shortestDelta(agent.y, cy, height);
  const distSq = dx * dx + dy * dy;

  // Near-field: fully omnidirectional, inclusive radius.
  const nr = perceptionCfg.nearRadius;
  if (distSq <= nr * nr) {
    return { visible: true, distance: Math.sqrt(distSq), inNear: true, dx, dy };
  }

  const range = agent.traits.visionRange;
  if (distSq > range * range) {
    return { visible: false, distance: Math.sqrt(distSq), inNear: false, dx, dy };
  }

  // Angular test. atan2 of the delta vs the agent's facing.
  // Handle the degenerate case of the agent standing on the candidate cell
  // (would have been caught by near-field above, but guard anyway).
  if (dx === 0 && dy === 0) {
    return { visible: true, distance: 0, inNear: true, dx, dy };
  }

  const angleToTarget = Math.atan2(dy, dx);
  // Shortest angular difference, wrapped to (-PI, PI].
  let delta = angleToTarget - agent.facing;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;

  const half = perceptionCfg.coneHalfAngleRad;
  if (Math.abs(delta) > half) {
    return { visible: false, distance: Math.sqrt(distSq), inNear: false, dx, dy };
  }
  return { visible: true, distance: Math.sqrt(distSq), inNear: false, dx, dy };
}

// Integer Bresenham line from (x0,y0) to (x1,y1) in unwrapped space.
// Yields intermediate cells (excluding both endpoints) via callback.
// The caller wraps coordinates when looking up cells/objects.
function forEachLineCell(x0, y0, x1, y1, cb) {
  let cx = x0;
  let cy = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  // Step until we're one cell away from the endpoint. We do not emit the
  // starting cell or the ending cell — those are the observer and target.
  while (true) {
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; cx += sx; }
    if (e2 < dx) { err += dx; cy += sy; }
    if (cx === x1 && cy === y1) return;
    cb(cx, cy);
  }
}

// True if any intermediate cell between agent and target blocks vision.
// Uses the signed shortest-delta endpoint so the line crosses the wrap
// seam when appropriate.
function hasLineOfSight(world, agent, cx, cy, occluderCells) {
  const { config } = world;
  const { width, height } = config;

  const dx = shortestDelta(agent.x, cx, width);
  const dy = shortestDelta(agent.y, cy, height);

  // Use unwrapped endpoints so Bresenham walks in straight line, then wrap
  // each intermediate coord when we query terrain / occluder set.
  const x0 = agent.x;
  const y0 = agent.y;
  const x1 = agent.x + dx;
  const y1 = agent.y + dy;

  let blocked = false;
  forEachLineCell(x0, y0, x1, y1, (ix, iy) => {
    if (blocked) return;
    const wx = wrap(ix, width);
    const wy = wrap(iy, height);
    const cell = world.terrain.cellAt(wx, wy);
    if (cell.blocksVision) { blocked = true; return; }
    const key = wy * width + wx;
    if (occluderCells.has(key)) { blocked = true; return; }
  });
  return !blocked;
}

function createPerception(world) {
  const { config, chunkIndex, objects, agents, terrain } = world;
  const { width, height } = config;
  const perceptionCfg = config.perception;

  // Build a Set of cell keys that hold opaque objects inside the bbox.
  // Done once per perceive call so LOS tests are O(1) per cell.
  function buildOccluderSet(bboxX, bboxY, bboxW, bboxH) {
    const out = new Set();
    const found = objects.queryRect(bboxX, bboxY, bboxW, bboxH, OPAQUE_OBJECT_TYPES);
    for (const o of found) {
      out.add(o.y * width + o.x);
    }
    return out;
  }

  // Gather candidate entities (objects + other agents) whose cells lie in
  // the vision bbox around the agent.
  function gatherCandidates(agent, bboxX, bboxY, bboxW, bboxH) {
    const out = [];

    // Objects of all types (trees, rocks, food, water_source, rest_spot).
    const objs = objects.queryRect(bboxX, bboxY, bboxW, bboxH, null);
    for (const o of objs) {
      out.push({ id: o.id, type: o.type, x: o.x, y: o.y });
    }

    // Other agents via the chunk index. Filter self out.
    const chunks = chunkIndex.chunksInRect(bboxX, bboxY, bboxW, bboxH);
    const seen = new Set();
    for (const { cx, cy } of chunks) {
      const chunk = chunkIndex.getChunk(cx, cy);
      for (const id of chunk.agentIds) {
        if (id === agent.id) continue;
        if (seen.has(id)) continue;
        const other = agents.getById(id);
        if (!other) continue;
        seen.add(id);
        out.push({ id: other.id, type: 'agent', x: other.x, y: other.y });
      }
    }

    return out;
  }

  function perceiveAgent(agent) {
    const range = agent.traits.visionRange;
    // Bounding box in UNWRAPPED coords; queryRect + chunksInRect both handle
    // wrap internally.
    const bboxX = agent.x - range;
    const bboxY = agent.y - range;
    const bboxW = range * 2 + 1;
    const bboxH = range * 2 + 1;

    const occluders = buildOccluderSet(bboxX, bboxY, bboxW, bboxH);
    const candidates = gatherCandidates(agent, bboxX, bboxY, bboxW, bboxH);

    const visible = [];
    for (const c of candidates) {
      const env = withinEnvelope(agent, c.x, c.y, width, height, perceptionCfg);
      if (!env.visible) continue;
      // An opaque object sitting on its own cell should still be visible —
      // the occluder test only applies to CELLS BETWEEN observer and target.
      if (!hasLineOfSight({ config, terrain }, agent, c.x, c.y, occluders)) continue;
      visible.push({
        id: c.id,
        type: c.type,
        x: c.x,
        y: c.y,
        distance: env.distance,
        inNear: env.inNear,
      });
    }

    visible.sort((a, b) => a.distance - b.distance);
    return visible;
  }

  return { perceiveAgent };
}

module.exports = {
  createPerception,
  // Exported for unit tests / debugging.
  _internals: {
    withinEnvelope,
    hasLineOfSight,
    shortestDelta,
    forEachLineCell,
    OPAQUE_OBJECT_TYPES,
  },
};
