'use strict';

const { randomUUID } = require('node:crypto');
const { findPath } = require('./pathfinding');
const { updateAgentMemory } = require('./memory');
const { splitmix32 } = require('../utils/prng');
const { wrappedDistance } = require('../utils/wrap');
const {
  decayNeeds,
  tickAction,
  beginActionIfArrived,
  pickUrgentNeed,
  pickMemoryTargetForType,
  NEED_TO_MEMORY_TYPE,
  GOAL_TO_ACTION,
} = require('./needs');

function createSimulation(world, onTick = () => {}) {

  const { config, agents, objects, perception, deaths } = world;
  const { simulation: simConfig } = config;
  const tickMs = simConfig.tickMs || 200;
  const rng = splitmix32(config.seed ^ 0x6d2b79f5);

  let tickCount = 0;
  let intervalId = null;
  let deathCount = 0;
  let worldId = randomUUID();
  // Wall-clock anchor for rendering between authoritative ticks. It is
  // intentionally reset when a restored world starts a new timer.
  let lastTickAt = null;

  // Helper function to calculate agent density in a given area
  function calculateAgentDensity(centerX, centerY, radius) {
    const { chunkIndex } = world;
    const bboxX = centerX - radius;
    const bboxY = centerY - radius;
    const bboxW = radius * 2 + 1;
    const bboxH = radius * 2 + 1;

    const chunks = chunkIndex.chunksInRect(bboxX, bboxY, bboxW, bboxH);
    let nearbyAgents = 0;

    for (const { cx, cy } of chunks) {
      const chunk = chunkIndex.getChunk(cx, cy);
      nearbyAgents += chunk.agentIds.length;
    }

    return nearbyAgents;
  }

  // Helper function to find alternative memory target of same type
  function pickAlternativeMemoryTarget(agent, memType, excludeId) {
    const memories = agent.memory || [];
    const candidates = memories
      .filter(mem => mem.type === memType && mem.id !== excludeId)
      .filter(mem => mem.confidence > 0.3) // Only consider reasonably fresh memories
      .sort((a, b) => b.confidence - a.confidence); // Sort by confidence

    // Return the highest confidence alternative, if any
    return candidates.length > 0 ? candidates[0] : null;
  }

  function tick() {
    lastTickAt = Date.now();
    tickCount++;

    // World-level timers (food regrowth + periodic spread) run once per
    // tick regardless of agent state.
    objects.tickRegrowth(tickCount);
    objects.tickFoodSpread(tickCount);

    // Snapshot the agent list so removals mid-tick don't reshape the
    // iteration. Dead agents are removed at the end of their update.
    const allAgents = agents.listAll();
    const toRemove = [];

    for (const agent of allAgents) {
      updateAgent(agent, world, tickCount);
      if (agent.dead) toRemove.push(agent.id);
    }

    for (const id of toRemove) {
      const agent = agents.getById(id);
      if (agent) {
        // Determine cause of death
        let cause = 'unknown';
        if (agent.hunger >= 1) cause = 'hunger';
        else if (agent.thirst >= 1) cause = 'thirst';
        else if (agent.tiredness >= 1) cause = 'tiredness';

        // Record death
        deaths.addDeath(id, tickCount, cause);
      }
      objects.removeAgentFromResources(id);
      agents.removeById(id);
      deathCount++;
    }

    if (tickCount % 100 === 0) {
      const alive = agents.listAll().length;
      console.log(
        `[simulation] tick ${tickCount} - ${alive} alive, ${deathCount} deaths total`,
      );
    }
    onTick(tickCount);
  }

  // Probability of picking a new wander goal on any given idle tick when
  // no need is urgent. Kept at 30% to match pre-M5 behavior.
  const WANDER_GOAL_PROB = 0.3;
  // When an urgent need exists, always attempt to act on it (no RNG gate).

  // Pick a goal for an idle agent. Priority order:
  // 1. Highest-value need above threshold -> seek_food/seek_water/seek_rest
  // 2. Check if target area is too crowded (> 5 agents in 10-cell radius)
  // 3. Otherwise, occasional random wander (same as before)
  function pickGoal(agent) {
    const urgent = pickUrgentNeed(agent, config);
    if (urgent) {
      const memType = NEED_TO_MEMORY_TYPE[urgent.need];
      const mem = pickMemoryTargetForType(agent, memType);
      if (mem) {
        // Check agent density around target location
        const densityRadius = 10; // 10-cell radius for density check
        const nearbyAgents = calculateAgentDensity(mem.x, mem.y, densityRadius);

        // If area is too crowded (>5 agents), look for alternative or wander
        if (nearbyAgents > 5) {
          // Try to find alternative memory of same type
          const altMem = pickAlternativeMemoryTarget(agent, memType, mem.id);
          if (altMem) {
            return {
              type: urgent.goal,
              targetX: altMem.x,
              targetY: altMem.y,
              memoryId: altMem.id,
              memoryConfidence: altMem.confidence,
            };
          }
          // No alternative found - wander away from crowded area
          return pickWanderGoal(agent, 40, 80, urgent.goal);
        }

        return {
          type: urgent.goal,
          targetX: mem.x,
          targetY: mem.y,
          memoryId: mem.id,
          memoryConfidence: mem.confidence,
        };
      }
      // No memory of a suitable resource — wander far to explore and
      // hopefully stumble into one. Pick a wider random hop.
      return pickWanderGoal(agent, 40, 80, urgent.goal);
    }

    if (rng() < WANDER_GOAL_PROB) {
      return pickWanderGoal(agent, 20, 50, 'wander');
    }
    return null;
  }

  function pickWanderGoal(agent, minDist, maxDist, type) {
    const span = Math.max(1, maxDist - minDist);
    const dist = minDist + Math.floor(rng() * span);
    const angle = rng() * Math.PI * 2;
    let tx = Math.floor(agent.x + Math.cos(angle) * dist);
    let ty = Math.floor(agent.y + Math.sin(angle) * dist);
    tx = ((tx % config.width) + config.width) % config.width;
    ty = ((ty % config.height) + config.height) % config.height;
    return { type, targetX: tx, targetY: ty };
  }

  function updateAgent(agent, world, currentTick) {
    // 1. Perception + memory always run first so behaviour uses fresh info.
    const visible = perception.perceiveAgent(agent);
    updateAgentMemory(agent, visible, currentTick, world.config);

    // 2. Needs decay. This may flip agent.dead = true; caller removes it
    //    from the store after this function returns.
    decayNeeds(agent, config);
    if (agent.dead) return;

    // 3. If the agent is mid-action (eat/drink/rest), tick it. Skip goal
    //    selection entirely this tick regardless of completion.
    if (
      agent.state === 'eating'
      || agent.state === 'drinking'
      || agent.state === 'resting'
    ) {
      tickAction(agent, objects, config, currentTick);

      return;
    }

    // 3b. If the agent is waiting, check if they can now use the resource
    if (agent.state === 'waiting') {
      const target = agent.actionTargetId && objects.getById(agent.actionTargetId);
      const actionState = agent.currentGoal && GOAL_TO_ACTION[agent.currentGoal.type];
      const valid = target && actionState
        && wrappedDistance(agent.x, agent.y, target.x, target.y, config.width, config.height) <= 1.5
        && (target.type !== 'food' || objects.isAvailable(target.id, currentTick));
      if (!valid) {
        objects.removeAgentFromResources(agent.id);
        agent.state = 'idle';
        agent.currentAction = null;
        agent.currentGoal = null;
        agent.actionTargetId = null;
      } else if (objects.tryAcquireResource(agent.id, target.id)) {
        agent.state = actionState;
        agent.currentAction = actionState;
        agent.actionTicksRemaining = config.survival.actionTicks;
      }
      return;
    }

    // 4. If a path is in progress, advance one step. On arrival, see if
    //    the goal was a seek_* and try to begin the matching action.
    if (agent.path && agent.path.length > 0 && agent.pathIndex < agent.path.length) {
      agents.stepAgent(agent, currentTick);
      const arrived = agent.pathIndex >= agent.path.length;
      if (arrived) {
        if (beginActionIfArrived(agent, objects, config, currentTick)) {
          return; // Action started; ready to tick next turn.
        }
        // Arrived but no matching object (e.g. memory was stale or food
        // got depleted before we got here). Clear the goal so idle logic
        // can pick a fresh one next tick.
        agent.currentGoal = null;
      }
      return;
    }

    // 5. Idle: pick a goal (needs-driven or wander).
    const goal = pickGoal(agent);
    if (!goal) return;

    const path = findPath(
      world,
      { x: agent.x, y: agent.y },
      { x: goal.targetX, y: goal.targetY },
      { excludeAgentId: agent.id }
    );
    if (path && path.length > 0) {
      agent.currentGoal = goal;
      agents.setPath(agent, path);
    } else {
      // Pathfinding failed — stay idle, don't latch a goal we can't reach.
      agent.currentGoal = null;
      agent.currentAction = null;
    }
  }

  function start() {
    if (!intervalId) {
      lastTickAt = Date.now();
      intervalId = setInterval(tick, tickMs);
    }
  }
  function stop() {
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
  }
  function snapshot() { return { tickCount, deathCount, rngState: rng.getState(), worldId }; }
  function restore(state) {
    tickCount = state.tickCount;
    deathCount = state.deathCount;
    rng.setState(state.rngState);
    worldId = state.worldId || randomUUID();
  }

  function getStatus() {
    return {
      tickCount,
      tickMs,
      lastTickAt,
      agentCount: agents.listAll().length,
      deathCount,
      worldId,
    };
  }

  return {
    getStatus,
    tick, start, stop, snapshot, restore,
  };
}

module.exports = { createSimulation };
