'use strict';

// In-memory per-chunk spatial index.
//
// Each chunk holds lists of ids for items, static objects, and agents.
// Phase 2 only populates `objectIds` (via the object store), but we keep the
// three-bucket shape so later phases can plug in without re-plumbing.

const { wrap } = require('../utils/wrap');

function keyOf(cx, cy) {
  return `${cx},${cy}`;
}

function createChunkIndex(config) {
  const { width, height, chunkSize } = config;
  const chunksW = Math.floor(width / chunkSize);
  const chunksH = Math.floor(height / chunkSize);
  const chunks = new Map();

  function getChunk(cx, cy) {
    const wcx = ((cx % chunksW) + chunksW) % chunksW;
    const wcy = ((cy % chunksH) + chunksH) % chunksH;
    const k = keyOf(wcx, wcy);
    let c = chunks.get(k);
    if (!c) {
      c = { cx: wcx, cy: wcy, key: k, itemIds: [], objectIds: [], agentIds: [] };
      chunks.set(k, c);
    }
    return c;
  }

  function getChunkFromWorld(x, y) {
    const wx = wrap(x, width);
    const wy = wrap(y, height);
    return getChunk(Math.floor(wx / chunkSize), Math.floor(wy / chunkSize));
  }

  // Iterate all unique chunks that intersect a world-space rect. The rect
  // is given in unwrapped coords (x,y may be negative or exceed world size);
  // we expand into chunk coords and then collapse via wrap inside getChunk.
  function chunksInRect(x, y, w, h) {
    const cxMin = Math.floor(x / chunkSize);
    const cyMin = Math.floor(y / chunkSize);
    const cxMax = Math.floor((x + w - 1) / chunkSize);
    const cyMax = Math.floor((y + h - 1) / chunkSize);
    const seen = new Set();
    const out = [];
    for (let cy = cyMin; cy <= cyMax; cy++) {
      for (let cx = cxMin; cx <= cxMax; cx++) {
        const wcx = ((cx % chunksW) + chunksW) % chunksW;
        const wcy = ((cy % chunksH) + chunksH) % chunksH;
        const k = keyOf(wcx, wcy);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ cx: wcx, cy: wcy, key: k });
      }
    }
    return out;
  }

  function addObjectId(cx, cy, id) {
    getChunk(cx, cy).objectIds.push(id);
  }
  function addItemId(cx, cy, id) {
    getChunk(cx, cy).itemIds.push(id);
  }
  function addAgentId(cx, cy, id) {
    getChunk(cx, cy).agentIds.push(id);
  }
  function removeFrom(list, id) {
    const idx = list.indexOf(id);
    if (idx >= 0) list.splice(idx, 1);
  }
  function moveAgent(id, fromCx, fromCy, toCx, toCy) {
    if (fromCx === toCx && fromCy === toCy) return;
    removeFrom(getChunk(fromCx, fromCy).agentIds, id);
    addAgentId(toCx, toCy, id);
  }

  return {
    chunksW,
    chunksH,
    getChunk,
    getChunkFromWorld,
    chunksInRect,
    addObjectId,
    addItemId,
    addAgentId,
    removeObjectId: (cx, cy, id) => removeFrom(getChunk(cx, cy).objectIds, id),
    removeItemId: (cx, cy, id) => removeFrom(getChunk(cx, cy).itemIds, id),
    removeAgentId: (cx, cy, id) => removeFrom(getChunk(cx, cy).agentIds, id),
    moveAgent,
    _chunks: chunks,
  };
}

module.exports = { createChunkIndex };
