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

  // Start simulation
  router.post('/start', (req, res) => {
    try {
      const { simulation } = getWorld();
      simulation.start();
      const status = simulation.getStatus();
      res.json({ message: 'Simulation started', status });
    } catch (error) {
      res.status(500).json({ error: 'Failed to start simulation', message: error.message });
    }
  });

  // Stop simulation
  router.post('/stop', (req, res) => {
    try {
      const { simulation } = getWorld();
      simulation.stop();
      const status = simulation.getStatus();
      res.json({ message: 'Simulation stopped', status });
    } catch (error) {
      res.status(500).json({ error: 'Failed to stop simulation', message: error.message });
    }
  });

  // Execute single tick (for debugging)
  router.post('/tick', (req, res) => {
    try {
      const { simulation } = getWorld();
      simulation.tick();
      const status = simulation.getStatus();
      res.json({ message: 'Single tick executed', status });
    } catch (error) {
      res.status(500).json({ error: 'Failed to execute tick', message: error.message });
    }
  });

  return router;
}

module.exports = { createSimulationRoutes };
