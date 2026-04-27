'use strict';

// Terrain chunk caching system for world pre-generation
// Stores all terrain chunks in memory for instant access

class TerrainCache {
  constructor(config) {
    this.config = config;
    this.chunkSize = config.chunkSize;
    this.chunksW = Math.floor(config.width / config.chunkSize);
    this.chunksH = Math.floor(config.height / config.chunkSize);
    
    // Main cache storage: Map<chunkKey, chunkData>
    this.cache = new Map();
    
    // Statistics
    this.hits = 0;
    this.misses = 0;
    this.totalChunks = this.chunksW * this.chunksH;
    this.generatedChunks = 0;
  }
  
  // Generate chunk key from coordinates
  _key(cx, cy) {
    return `${cx},${cy}`;
  }
  
  // Store a chunk in cache
  setChunk(cx, cy, chunkData) {
    const key = this._key(cx, cy);
    this.cache.set(key, chunkData);
    this.generatedChunks++;
  }
  
  // Retrieve a chunk from cache
  getChunk(cx, cy) {
    const key = this._key(cx, cy);
    const chunk = this.cache.get(key);
    
    if (chunk) {
      this.hits++;
      return chunk;
    } else {
      this.misses++;
      return null;
    }
  }
  
  // Check if chunk exists in cache
  hasChunk(cx, cy) {
    return this.cache.has(this._key(cx, cy));
  }
  
  // Get cache statistics
  getStats() {
    return {
      totalChunks: this.totalChunks,
      generatedChunks: this.generatedChunks,
      cacheSize: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hits + this.misses > 0 ? this.hits / (this.hits + this.misses) : 0,
      completeness: this.generatedChunks / this.totalChunks
    };
  }
  
  // Clear all cached chunks
  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.generatedChunks = 0;
  }
  
  // Get memory usage estimate (rough calculation)
  getMemoryUsage() {
    // Rough estimate: each chunk stores 5 layers * chunkSize^2 * 4 bytes per float
    const bytesPerChunk = 5 * this.chunkSize * this.chunkSize * 4;
    const totalBytes = this.cache.size * bytesPerChunk;
    return {
      bytesPerChunk,
      totalBytes,
      totalMB: totalBytes / (1024 * 1024)
    };
  }
}

// Singleton instance
let cacheInstance = null;

function createTerrainCache(config) {
  if (!cacheInstance) {
    cacheInstance = new TerrainCache(config);
  }
  return cacheInstance;
}

function getTerrainCache() {
  return cacheInstance;
}

module.exports = { TerrainCache, createTerrainCache, getTerrainCache };
