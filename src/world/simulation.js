'use strict';

const { isCellPathable } = require('./agents');

let singleton = null;

function createSimulation(world) {
  if (singleton) return singleton;

  const { config, agents } = world;
  const { simulation: simConfig } = config;
  const tickMs = simConfig.tickMs || 200;

  let tickCount = 0;
  let intervalId = null;
  let isRunning = false;

  function tick() {
    tickCount++;

    // Update all agents
    const allAgents = agents.listAll();

    for (const agent of allAgents) {
      updateAgent(agent, world, tickCount);
    }

    // Clean up any dead agents, resources, etc. (future)

    if (tickCount % 100 === 0) {
      console.log(`[simulation] tick ${tickCount} - ${allAgents.length} agents updated`);
    }
  }

  function updateAgent(agent, world, currentTick) {
    // Basic wandering behavior for now
    // Will be expanded with needs-driven decisions in Milestone 5

    // If agent has no current goal, set a simple wander goal
    if (!agent.currentGoal && Math.random() < 0.02) { // 2% chance per tick to set a new goal
      const rng = Math.random();
      const wanderDistance = 20 + Math.floor(rng * 30); // 20-50 cells

      // Pick a random direction
      const angle = rng * Math.PI * 2;
      const targetX = Math.floor(agent.x + Math.cos(angle) * wanderDistance);
      const targetY = Math.floor(agent.y + Math.sin(angle) * wanderDistance);

      // Wrap coordinates
      const wrappedX = (targetX + world.config.width) % world.config.width;
      const wrappedY = (targetY + world.config.height) % world.config.height;

      agent.currentGoal = {
        type: 'wander',
        targetX: wrappedX,
        targetY: wrappedY
      };

      agent.currentAction = 'moving';
    }

    // Execute movement if agent has a goal and is moving
    if (agent.currentGoal && agent.currentAction === 'moving') {
      // Simple movement: move 1 cell toward goal per tick
      const dx = agent.currentGoal.targetX - agent.x;
      const dy = agent.currentGoal.targetY - agent.y;

      // Handle wrap-around for shortest path
      const worldWidth = world.config.width;
      const worldHeight = world.config.height;

      // Adjust for wrap-around to find shortest path
      let adjDx = dx;
      let adjDy = dy;

      if (Math.abs(dx) > worldWidth / 2) {
        adjDx = dx > 0 ? dx - worldWidth : dx + worldWidth;
      }
      if (Math.abs(dy) > worldHeight / 2) {
        adjDy = dy > 0 ? dy - worldHeight : dy + worldHeight;
      }

      // Check if reached goal
      if (adjDx === 0 && adjDy === 0) {
        agent.currentGoal = null;
        agent.currentAction = 'idle';
        return;
      }

      // Move one step toward goal
      let newX = agent.x;
      let newY = agent.y;

      if (adjDx !== 0) {
        newX = (agent.x + Math.sign(adjDx) + worldWidth) % worldWidth;
      }
      if (adjDy !== 0) {
        newY = (agent.y + Math.sign(adjDy) + worldHeight) % worldHeight;
      }

      // Check if new position is walkable
      const cell = world.terrain.cellAt(newX, newY);
      const isPathable = isCellPathable(cell, config.agents.deepWaterThreshold);

      if (isPathable) {
        // Update position
        agent.x = newX;
        agent.y = newY;

        // Update chunk index
        const oldCx = Math.floor((agent.x - Math.sign(adjDx)) / world.config.chunkSize);
        const oldCy = Math.floor((agent.y - Math.sign(adjDy)) / world.config.chunkSize);
        const newCx = Math.floor(agent.x / world.config.chunkSize);
        const newCy = Math.floor(agent.y / world.config.chunkSize);

        if (oldCx !== newCx || oldCy !== newCy) {
          world.chunkIndex.moveAgent(agent.id, oldCx, oldCy, newCx, newCy);
        }

        // Update facing direction
        if (adjDx !== 0 || adjDy !== 0) {
          agent.facing = Math.atan2(adjDy, adjDx);
        }
      } else {
        // Blocked - clear goal and try again later
        agent.currentGoal = null;
        agent.currentAction = 'idle';
      }
    }
  }

  function start() {
    if (isRunning) return;

    isRunning = true;
    intervalId = setInterval(tick, tickMs);
    console.log(`[simulation] started - tick interval ${tickMs}ms`);
  }

  function stop() {
    if (!isRunning) return;

    isRunning = false;
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    console.log('[simulation] stopped');
  }

  function getStatus() {
    return {
      isRunning,
      tickCount,
      tickMs,
      agentCount: agents.listAll().length
    };
  }

  singleton = {
    start,
    stop,
    getStatus,
    tick
  };

  return singleton;
}

module.exports = { createSimulation };
