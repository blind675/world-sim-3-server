'use strict';

const express = require('express');
const { getWorld } = require('../world/world');

function createSimulationRoutes() {
  const router = express.Router();

  // Get simulation status
  router.get('/status', (req, res) => {
    try {
      const { simulation } = getWorld();
      const status = simulation.getStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get simulation status', message: error.message });
    }
  });


  return router;
}

module.exports = { createSimulationRoutes };
