'use strict';

const { isCellPathable } = require('./agents');
const { findPath } = require('./pathfinding');

let singleton = null;

function createSimulation(world) {
  if (singleton) return singleton;

  const { config, agents } = world;
  const { simulation: simConfig } = config;
  const tickMs = simConfig.tickMs || 200;

  let tickCount = 0;
  let intervalId = null;

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
    // Higher chance (30%) for idle agents to get new goals more frequently
    if (!agent.currentGoal && Math.random() < 0.3) { // 30% chance per tick to set a new goal
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

      // Compute path to the goal
      const path = findPath(world, { x: agent.x, y: agent.y }, { x: wrappedX, y: wrappedY });
      if (path) {
        agents.setPath(agent, path);
      } else {
        // No path found, clear the goal
        agent.currentGoal = null;
        agent.currentAction = null;
      }
    }

    // Execute movement if agent has a path
    if (agent.path && agent.path.length > 0 && agent.pathIndex < agent.path.length) {
      // Use the agent store's stepAgent function for movement tracking
      agents.stepAgent(agent, currentTick);
    }
  }


  // Auto-start the simulation
  intervalId = setInterval(tick, tickMs);
  console.log(`[simulation] auto-started - tick interval ${tickMs}ms`);

  function getStatus() {
    return {
      tickCount,
      tickMs,
      agentCount: agents.listAll().length
    };
  }

  singleton = {
    getStatus
  };

  return singleton;
}

module.exports = { createSimulation };
