'use strict';

const { isCellPathable } = require('./agents');
const { findPath } = require('./pathfinding');
const { updateAgentMemory } = require('./memory');

let singleton = null;

function createSimulation(world) {
  if (singleton) return singleton;

  const { config, agents, perception } = world;
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

  // Goal-selection probability per idle tick. Kept at 30% to match the
  // prior behavior and avoid making agents too twitchy.
  const GOAL_PROB = 0.3;
  // Fraction of new goals that prefer a remembered food/water target
  // (over a pure random wander). Tuned so behavior is visibly influenced
  // by memory without fully replacing exploration.
  const MEMORY_GOAL_BIAS = 0.6;
  const INTERESTING_TYPES = new Set(['food', 'water_source']);

  function pickMemoryTarget(agent) {
    // TODO(clusters): when food/water are added to CLUSTER_TYPES in memory.js,
    // cluster memories of those types should be valid targets too (use the
    // cluster centroid as targetX/targetY, and set goal.memoryKind='cluster').
    // Trees are the only clusterable type today and aren't in INTERESTING_TYPES,
    // so this filter naturally skips clusters for now.
    const candidates = agent.memory.filter(
      (m) => m.kind !== 'cluster' && INTERESTING_TYPES.has(m.type),
    );
    if (candidates.length === 0) return null;
    // Highest confidence first, with a small recency tiebreak.
    candidates.sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return b.lastSeenTick - a.lastSeenTick;
    });
    return candidates[0];
  }

  function updateAgent(agent, world, currentTick) {
    // Perception + memory run first so behavior can use the freshest info.
    const visible = perception.perceiveAgent(agent);
    updateAgentMemory(agent, visible, currentTick, world.config);

    // Basic wandering behavior for now, biased toward remembered resources.
    // Will be expanded with needs-driven decisions in Milestone 5.

    if (!agent.currentGoal && Math.random() < GOAL_PROB) {
      let targetX;
      let targetY;
      let goal;

      const memTarget = Math.random() < MEMORY_GOAL_BIAS ? pickMemoryTarget(agent) : null;
      if (memTarget) {
        targetX = memTarget.x;
        targetY = memTarget.y;
        goal = {
          type: memTarget.type === 'food' ? 'seek_food' : 'seek_water',
          targetX,
          targetY,
          memoryId: memTarget.id,
          memoryConfidence: memTarget.confidence,
        };
      } else {
        // Fall back to random wander.
        const rng = Math.random();
        const wanderDistance = 20 + Math.floor(rng * 30); // 20-50 cells
        const angle = rng * Math.PI * 2;
        targetX = Math.floor(agent.x + Math.cos(angle) * wanderDistance);
        targetY = Math.floor(agent.y + Math.sin(angle) * wanderDistance);
        targetX = (targetX + world.config.width) % world.config.width;
        targetY = (targetY + world.config.height) % world.config.height;
        goal = { type: 'wander', targetX, targetY };
      }

      agent.currentGoal = goal;

      const path = findPath(world, { x: agent.x, y: agent.y }, { x: targetX, y: targetY });
      if (path) {
        agents.setPath(agent, path);
      } else {
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
