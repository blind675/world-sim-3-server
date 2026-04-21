'use strict';

const express = require('express');
const cors = require('cors');

const worldRoutes = require('./routes/world');
const entitiesRoutes = require('./routes/entities');
const agentsRoutes = require('./routes/agents');
const { createSimulationRoutes } = require('./routes/simulation');

function createApp() {
  const app = express();

  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
  app.use(cors({ origin: corsOrigin === '*' ? true : corsOrigin.split(',') }));
  app.use(express.json({ limit: '1mb' }));

  // Simple request logger for development.
  app.use((req, _res, next) => {
    if (process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', uptimeSec: Math.round(process.uptime()) });
  });

  app.use('/api/world', worldRoutes);
  app.use('/api/entities', entitiesRoutes);
  app.use('/api', agentsRoutes);
  app.use('/api/simulation', createSimulationRoutes());

  app.use((req, res) => {
    res.status(404).json({ error: 'not_found', path: req.originalUrl });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    // eslint-disable-next-line no-console
    console.error('[error]', err);
    res.status(500).json({ error: 'internal_server_error', message: err.message });
  });

  return app;
}

module.exports = { createApp };
