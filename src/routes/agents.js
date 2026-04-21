'use strict';

const express = require('express');
const { getWorld } = require('../world/world');
const { findPath } = require('../world/pathfinding');
const { wrap } = require('../utils/wrap');

const router = express.Router();

function parseIntParam(v, fallback) {
  if (v === undefined) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

// GET /api/agents — list summaries for all agents.
router.get('/agents', (req, res, next) => {
  try {
    const { agents } = getWorld();
    const list = agents.listAll().map(agents.publicView);
    res.json({ count: list.length, agents: list });
  } catch (e) { next(e); }
});

// GET /api/agents/:id — full detail view.
router.get('/agents/:id', (req, res, next) => {
  try {
    const { agents } = getWorld();
    const a = agents.getById(req.params.id);
    if (!a) return res.status(404).json({ error: 'not_found' });
    res.json(agents.detailView(a));
  } catch (e) { next(e); }
});

// POST /api/agents/:id/path  body: { x, y }
// Computes A* from the agent's current cell to (x, y), stores the path,
// and returns a summary of it.
router.post('/agents/:id/path', (req, res, next) => {
  try {
    const world = getWorld();
    const { config, agents } = world;
    const a = agents.getById(req.params.id);
    if (!a) return res.status(404).json({ error: 'not_found' });

    const body = req.body || {};
    const tx = parseIntParam(body.x, NaN);
    const ty = parseIntParam(body.y, NaN);
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) {
      return res.status(400).json({ error: 'x and y are required integers' });
    }
    const gx = wrap(tx, config.width);
    const gy = wrap(ty, config.height);

    const path = findPath(world, { x: a.x, y: a.y }, { x: gx, y: gy });
    if (path === null) {
      agents.setPath(a, []);
      return res.status(422).json({ error: 'no_path', from: { x: a.x, y: a.y }, to: { x: gx, y: gy } });
    }
    agents.setPath(a, path);
    res.json({
      id: a.id,
      from: { x: a.x, y: a.y },
      to: { x: gx, y: gy },
      length: path.length,
      path,
    });
  } catch (e) { next(e); }
});

// POST /api/sim/step  body: { steps?: number }
// Advances every agent one cell along its stored path, repeated `steps` times.
const MAX_STEPS_PER_CALL = 64;
router.post('/sim/step', (req, res, next) => {
  try {
    const { agents } = getWorld();
    const body = req.body || {};
    let steps = parseIntParam(body.steps, 1);
    if (!Number.isFinite(steps) || steps < 1) steps = 1;
    if (steps > MAX_STEPS_PER_CALL) steps = MAX_STEPS_PER_CALL;
    agents.stepAll(steps);
    const list = agents.listAll().map(agents.publicView);
    res.json({ steps, agents: list });
  } catch (e) { next(e); }
});

module.exports = router;
