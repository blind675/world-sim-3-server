'use strict';

const express = require('express');
const { getWorld } = require('../world/world');

const router = express.Router();

const ALL_TYPES = new Set(['tree', 'rock', 'food', 'water_source', 'rest_spot', 'agent']);

// Protective cap on viewport size. At zoom where ~10 chunks are visible,
// the client's viewport is at most 10*128 = 1280 cells per axis, so 2048 is
// a comfortable upper bound.
const MAX_VIEWPORT_SIDE = 2048;

function parseIntParam(v, fallback) {
  if (v === undefined) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

// GET /api/entities/in-view?x=&y=&w=&h=&types=tree,rock
// Returns all objects (of the requested types) whose position is inside the
// world-space rect, accounting for wrap.
router.get('/in-view', (req, res, next) => {
  try {
    const { objects } = getWorld();

    const x = parseIntParam(req.query.x, NaN);
    const y = parseIntParam(req.query.y, NaN);
    const w = parseIntParam(req.query.w, NaN);
    const h = parseIntParam(req.query.h, NaN);

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return res.status(400).json({ error: 'x and y are required integers' });
    }
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
      return res.status(400).json({ error: 'w and h must be positive integers' });
    }
    if (w > MAX_VIEWPORT_SIDE || h > MAX_VIEWPORT_SIDE) {
      return res.status(400).json({
        error: `viewport too large: ${w}x${h} (max ${MAX_VIEWPORT_SIDE} per side)`,
      });
    }

    let typesSet = null;
    if (req.query.types !== undefined && req.query.types !== '') {
      const requested = req.query.types.toString().split(',').map((s) => s.trim()).filter(Boolean);
      for (const t of requested) {
        if (!ALL_TYPES.has(t)) {
          return res.status(400).json({ error: `unknown type: ${t}` });
        }
      }
      typesSet = new Set(requested);
    }

    // Objects (non-agent) come from the object store.
    const includeObjects = !typesSet
      || typesSet.has('tree') || typesSet.has('rock')
      || typesSet.has('food') || typesSet.has('water_source') || typesSet.has('rest_spot');
    const objectTypes = typesSet
      ? new Set([...typesSet].filter((t) => t !== 'agent'))
      : null;

    const out = [];
    if (includeObjects) {
      const found = objects.queryRect(x, y, w, h, objectTypes);
      for (const o of found) out.push({ id: o.id, type: o.type, x: o.x, y: o.y });
    }

    // Agents (filtered via chunk index + wrapped rect containment).
    let agentOut = [];
    if (!typesSet || typesSet.has('agent')) {
      const { agents, chunkIndex, config } = getWorld();
      const chunks = chunkIndex.chunksInRect(x, y, w, h);
      const W = config.width;
      const H = config.height;
      const seen = new Set();
      for (const { cx, cy } of chunks) {
        const chunk = chunkIndex.getChunk(cx, cy);
        for (const id of chunk.agentIds) {
          if (seen.has(id)) continue;
          const a = agents.getById(id);
          if (!a) continue;
          let dx = a.x - x; dx = ((dx % W) + W) % W;
          let dy = a.y - y; dy = ((dy % H) + H) % H;
          if (dx < w && dy < h) {
            seen.add(id);
            agentOut.push({
              id: a.id, type: 'agent',
              x: a.x, y: a.y,
              facing: a.facing, state: a.state,
            });
          }
        }
      }
      for (const a of agentOut) out.push(a);
    }

    res.json({
      x, y, w, h,
      objectCount: out.length - agentOut.length,
      agentCount: agentOut.length,
      objects: out,
    });
  } catch (e) {
    next(e);
  }
});

// GET /api/entities/:id — detail endpoint for inspection.
router.get('/:id', (req, res, next) => {
  try {
    const { objects } = getWorld();
    const obj = objects.getById(req.params.id);
    if (!obj) return res.status(404).json({ error: 'not_found' });
    res.json(obj);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
