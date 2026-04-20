'use strict';

const express = require('express');
const { getWorld } = require('../world/world');
const { wrap } = require('../utils/wrap');

const router = express.Router();

const ALLOWED_LAYERS = new Set([
  'height',
  'groundType',
  'waterDepth',
  'moveCost',
  'blocksVision',
]);

// Caps to protect the server from pathological requests during development.
const MAX_VIEWPORT_CELLS = 256 * 256;
const MAX_STRIDE = 32;

router.get('/meta', (req, res) => {
  const { config } = getWorld();
  res.json({
    seed: config.seed,
    width: config.width,
    height: config.height,
    cellSize: config.cellSize,
    chunkSize: config.chunkSize,
    wrapMode: config.wrapMode,
    terrain: {
      minHeight: config.terrain.minHeight,
      maxHeight: config.terrain.maxHeight,
      seaLevel: config.terrain.seaLevel,
    },
    simulation: {
      tickMs: config.simulation.tickMs,
    },
  });
});

function parseIntParam(v, fallback) {
  if (v === undefined) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

router.get('/viewport', (req, res, next) => {
  try {
    const { config, terrain } = getWorld();

    const x = parseIntParam(req.query.x, 0);
    const y = parseIntParam(req.query.y, 0);
    const w = parseIntParam(req.query.w, 64);
    const h = parseIntParam(req.query.h, 64);
    const stride = Math.max(1, Math.min(MAX_STRIDE, parseIntParam(req.query.stride, 1)));

    if (w <= 0 || h <= 0) {
      return res.status(400).json({ error: 'w and h must be positive integers' });
    }

    const layersParam = (req.query.layers || 'height,groundType').toString();
    const requested = layersParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const l of requested) {
      if (!ALLOWED_LAYERS.has(l)) {
        return res.status(400).json({ error: `unknown layer: ${l}` });
      }
    }

    // Output grid dims after stride.
    const outW = Math.ceil(w / stride);
    const outH = Math.ceil(h / stride);
    if (outW * outH > MAX_VIEWPORT_CELLS) {
      return res.status(400).json({
        error: `viewport too large: ${outW}x${outH} > ${MAX_VIEWPORT_CELLS} cells. Increase stride or reduce w/h.`,
      });
    }

    const W = config.width;
    const H = config.height;

    // Prepare typed-array buffers per requested layer.
    const wantHeight = requested.includes('height');
    const wantGround = requested.includes('groundType');
    const wantWater = requested.includes('waterDepth');
    const wantCost = requested.includes('moveCost');
    const wantBlocks = requested.includes('blocksVision');

    const heightArr = wantHeight ? new Float32Array(outW * outH) : null;
    const groundArr = wantGround ? new Array(outW * outH) : null;
    const waterArr = wantWater ? new Float32Array(outW * outH) : null;
    const costArr = wantCost ? new Float32Array(outW * outH) : null;
    const blocksArr = wantBlocks ? new Uint8Array(outW * outH) : null;

    for (let j = 0; j < outH; j++) {
      const wy = wrap(y + j * stride, H);
      for (let i = 0; i < outW; i++) {
        const wx = wrap(x + i * stride, W);
        const idx = j * outW + i;

        // Compute only what is needed; cellAt does everything but costs a bit more.
        if (wantGround || wantWater || wantCost || wantBlocks) {
          const cell = terrain.cellAt(wx, wy);
          if (heightArr) heightArr[idx] = cell.height;
          if (groundArr) groundArr[idx] = cell.groundType;
          if (waterArr) waterArr[idx] = cell.waterDepth;
          if (costArr) costArr[idx] = cell.baseMoveCost === Infinity ? -1 : cell.baseMoveCost;
          if (blocksArr) blocksArr[idx] = cell.blocksVision ? 1 : 0;
        } else if (heightArr) {
          heightArr[idx] = terrain.heightAt(wx, wy);
        }
      }
    }

    const layers = {};
    if (heightArr) layers.height = Array.from(heightArr);
    if (groundArr) layers.groundType = groundArr;
    if (waterArr) layers.waterDepth = Array.from(waterArr);
    if (costArr) layers.moveCost = Array.from(costArr);
    if (blocksArr) layers.blocksVision = Array.from(blocksArr);

    res.json({
      x, y, w, h, stride,
      outWidth: outW,
      outHeight: outH,
      wrap: config.wrapMode,
      worldWidth: W,
      worldHeight: H,
      layers,
    });
  } catch (e) {
    next(e);
  }
});

router.get('/cell', (req, res, next) => {
  try {
    const { config, terrain } = getWorld();
    const x = parseIntParam(req.query.x, NaN);
    const y = parseIntParam(req.query.y, NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return res.status(400).json({ error: 'x and y are required integers' });
    }
    const wx = wrap(x, config.width);
    const wy = wrap(y, config.height);
    const cell = terrain.cellAt(wx, wy);
    res.json({
      x: wx,
      y: wy,
      height: cell.height,
      groundType: cell.groundType,
      waterDepth: cell.waterDepth,
      baseMoveCost: cell.baseMoveCost === Infinity ? null : cell.baseMoveCost,
      blocksVision: cell.blocksVision,
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
