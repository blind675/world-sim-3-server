'use strict';

const express = require('express');
const router = express.Router();

/**
 * GET /api/deaths
 * Returns all recorded agent deaths with location and cause information
 */
router.get('/', (req, res) => {
  try {
    const { getWorld } = require('../world/world');
    const world = getWorld();
    const deaths = world.deaths.getAll();
    
    res.json(deaths);
  } catch (error) {
    console.error('[deaths] Error fetching deaths:', error);
    res.status(500).json({ error: 'Failed to fetch deaths' });
  }
});

/**
 * GET /api/deaths/recent
 * Returns recent deaths (default last 50)
 * Query params:
 * - limit: number of recent deaths to return (max 100)
 */
router.get('/recent', (req, res) => {
  try {
    const { getWorld } = require('../world/world');
    const world = getWorld();
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const deaths = world.deaths.getRecent(limit);
    
    res.json(deaths);
  } catch (error) {
    console.error('[deaths] Error fetching recent deaths:', error);
    res.status(500).json({ error: 'Failed to fetch recent deaths' });
  }
});

module.exports = router;
