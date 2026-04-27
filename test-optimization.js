#!/usr/bin/env node

// Test script to verify terrain optimization works
const { buildConfig } = require('./src/config/worldConfig');
const { createTerrain } = require('./src/world/terrain');

console.log('Testing terrain optimization...');

try {
  const config = buildConfig();
  console.log(`World config: ${config.width}x${config.height}, chunk size: ${config.chunkSize}`);
  
  console.log('Creating terrain with optimization...');
  const startTime = Date.now();
  const terrain = createTerrain(config);
  const creationTime = Date.now() - startTime;
  
  console.log(`Terrain creation took: ${creationTime}ms`);
  
  // Test pre-generation
  console.log('Starting world pre-generation...');
  const preGenStart = Date.now();
  const stats = terrain.preGenerateWorld();
  const preGenTime = Date.now() - preGenStart;
  
  console.log(`Pre-generation took: ${preGenTime}ms`);
  console.log(`Generated ${stats.generatedChunks}/${stats.totalChunks} chunks`);
  
  // Test chunk retrieval speed
  console.log('Testing chunk retrieval speed...');
  const testStart = Date.now();
  for (let i = 0; i < 1000; i++) {
    const cx = Math.floor(Math.random() * (config.width / config.chunkSize));
    const cy = Math.floor(Math.random() * (config.height / config.chunkSize));
    const baseX = cx * config.chunkSize;
    const baseY = cy * config.chunkSize;
    terrain.generateChunkLayers(baseX, baseY, config.chunkSize, ['height', 'groundType']);
  }
  const testTime = Date.now() - testStart;
  
  console.log(`1000 chunk retrievals took: ${testTime}ms (${(testTime/1000).toFixed(2)}ms per chunk)`);
  
  const cacheStats = terrain.getCacheStats();
  const memoryStats = terrain.getCacheMemory();
  
  console.log('Cache stats:', cacheStats);
  console.log('Memory usage:', memoryStats);
  
  console.log('✅ Optimization test completed successfully!');
  
} catch (error) {
  console.error('❌ Optimization test failed:', error);
  process.exit(1);
}
