'use strict';

// Pre-computed trigonometric lookup tables for optimized noise generation
// Replaces expensive Math.cos and Math.sin calls with fast array lookups

class TrigLookup {
  constructor(resolution = 10000) {
    this.resolution = resolution;
    this.twoPi = Math.PI * 2;
    this.step = this.twoPi / resolution;
    
    // Pre-compute sin and cos tables
    this.sinTable = new Float32Array(resolution);
    this.cosTable = new Float32Array(resolution);
    
    for (let i = 0; i < resolution; i++) {
      const angle = i * this.step;
      this.sinTable[i] = Math.sin(angle);
      this.cosTable[i] = Math.cos(angle);
    }
  }
  
  // Normalize angle to [0, 2π) and get table index
  _getIndex(angle) {
    // Handle negative angles and wrap around
    const normalized = ((angle % this.twoPi) + this.twoPi) % this.twoPi;
    return Math.floor(normalized / this.step);
  }
  
  // Fast sin lookup
  sin(angle) {
    return this.sinTable[this._getIndex(angle)];
  }
  
  // Fast cos lookup
  cos(angle) {
    return this.cosTable[this._getIndex(angle)];
  }
}

// Singleton instance
let instance = null;

function getTrigLookup(resolution = 10000) {
  if (!instance) {
    instance = new TrigLookup(resolution);
  }
  return instance;
}

module.exports = { TrigLookup, getTrigLookup };
