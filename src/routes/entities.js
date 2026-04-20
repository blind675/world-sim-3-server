'use strict';

const express = require('express');
const { getWorld } = require('../world/world');

const router = express.Router();

const ALL_TYPES = new Set(['tree', 'rock', 'food', 'water_source', 'rest_spot']);

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

    const found = objects.queryRect(x, y, w, h, typesSet);
    // Return a compact shape; no need to ship chunkKey to the client.
    const out = found.map((o) => ({ id: o.id, type: o.type, x: o.x, y: o.y }));
    res.json({ x, y, w, h, objectCount: out.length, objects: out });
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
