'use strict';

// A bounded cache for terrain chunks requested by the viewer. Map insertion
// order gives us a small LRU without another index or a full-world heightmap.
class TerrainCache {
  constructor(config) {
    this.maxChunks = config.terrainCacheMaxChunks;
    this.cache = new Map();
    this.hits = 0;
    this.misses = 0;
    this.generatedChunks = 0;
    this.evictions = 0;
  }

  _key(cx, cy) {
    return `${cx},${cy}`;
  }

  getChunk(cx, cy) {
    const key = this._key(cx, cy);
    const chunk = this.cache.get(key);
    if (!chunk) {
      this.misses++;
      return null;
    }
    this.hits++;
    this.cache.delete(key);
    this.cache.set(key, chunk);
    return chunk;
  }

  setChunk(cx, cy, chunk) {
    const key = this._key(cx, cy);
    this.cache.delete(key);
    this.cache.set(key, chunk);
    this.generatedChunks++;
    if (this.cache.size > this.maxChunks) {
      this.cache.delete(this.cache.keys().next().value);
      this.evictions++;
    }
  }

  getStats() {
    return {
      cacheSize: this.cache.size,
      maxChunks: this.maxChunks,
      generatedChunks: this.generatedChunks,
      evictions: this.evictions,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hits + this.misses ? this.hits / (this.hits + this.misses) : 0,
    };
  }

  getMemoryUsage() {
    let totalBytes = 0;
    for (const chunk of this.cache.values()) {
      totalBytes += chunk.height.byteLength + chunk.waterDepth.byteLength;
      totalBytes += chunk.moveCost.byteLength + chunk.blocksVision.byteLength;
      // Ground types are JS strings; 8 bytes per array element is a rough
      // upper estimate for references, excluding shared string constants.
      totalBytes += chunk.groundType.length * 8;
    }
    return { totalBytes, totalMB: totalBytes / (1024 * 1024) };
  }
}

module.exports = { TerrainCache };
