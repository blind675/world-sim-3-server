'use strict';

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const { requireControlToken } = require('./auth');

const worldRoutes = require('./routes/world');
const entitiesRoutes = require('./routes/entities');
const agentsRoutes = require('./routes/agents');
const { createSimulationRoutes } = require('./routes/simulation');
const { getWorld, resetWorld } = require('./world/world');

function createApp() {
  const app = express();

  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
  app.use(cors({ origin: corsOrigin === '*' ? true : corsOrigin.split(',') }));

  // gzip/deflate large JSON responses. /chunks payloads compress ~10-20x.
  // threshold:1024 skips tiny responses where compression cost > saving.
  app.use(compression({
    threshold: 1024,
    level: 6,
  }));

  app.use(express.json({ limit: '1mb' }));
  app.use('/api', (req, res, next) => {
    if (req.method === 'POST' && (/^\/agents\/[^/]+\/path$/.test(req.path) || req.path === '/sim/step')) {
      return requireControlToken(req, res, next);
    }
    next();
  });

  // Simple request logger for development.
  app.use((req, _res, next) => {
    if (process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    try {
      getWorld();
      res.json({ status: 'ok', uptimeSec: Math.round(process.uptime()) });
    } catch (error) {
      res.status(503).json({ status: 'unavailable', error: 'world_not_ready' });
    }
  });

  app.post('/api/admin/world/reset', requireControlToken, (req, res, next) => {
    try {
      const current = getWorld().simulation.getStatus();
      if (req.body?.confirmation !== 'RESET WORLD') {
        return res.status(400).json({ error: 'confirmation_required' });
      }
      if (req.body?.worldId !== current.worldId) {
        return res.status(409).json({ error: 'world_changed', current });
      }
      const fresh = resetWorld().simulation.getStatus();
      res.set('Cache-Control', 'no-store');
      res.json({ previous: current, current: fresh });
    } catch (error) { next(error); }
  });

  app.get('/api/object-definitions', (_req, res, next) => {
    try { res.json(getWorld().objectCatalog.publicView()); }
    catch (error) { next(error); }
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
