'use strict';

const { findPath } = require('./pathfinding');
const { updateAgentMemory } = require('./memory');
const {
  decayNeeds,
  tickAction,
  beginActionIfArrived,
  pickUrgentNeed,
  pickMemoryTargetForType,
  NEED_TO_MEMORY_TYPE,
} = require('./needs');

let singleton = null;

function createSimulation(world) {
  if (singleton) return singleton;

  const { config, agents, objects, perception, deaths } = world;
  const { simulation: simConfig } = config;
  const tickMs = simConfig.tickMs || 200;

  let tickCount = 0;
  let intervalId = null;
  let deathCount = 0;

  function tick() {
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

        // Record death location
        deaths.addDeath(id, agent.x, agent.y, tickCount, cause);
      }
      agents.removeById(id);
      deathCount++;
    }

    if (tickCount % 100 === 0) {
      const alive = agents.listAll().length;
      console.log(
        `[simulation] tick ${tickCount} - ${alive} alive, ${deathCount} deaths total`,
      );
    }
  }

  // Probability of picking a new wander goal on any given idle tick when
  // no need is urgent. Kept at 30% to match pre-M5 behavior.
  const WANDER_GOAL_PROB = 0.3;
  // When an urgent need exists, always attempt to act on it (no RNG gate).

  // Pick a goal for an idle agent. Priority order:
  // 1. Highest-value need above threshold -> seek_food/seek_water/seek_rest
  // 2. Otherwise, occasional random wander (same as before)
  function pickGoal(agent) {
    const urgent = pickUrgentNeed(agent, config);
    if (urgent) {
      const memType = NEED_TO_MEMORY_TYPE[urgent.need];
      const mem = pickMemoryTargetForType(agent, memType);
      if (mem) {
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

    if (Math.random() < WANDER_GOAL_PROB) {
      return pickWanderGoal(agent, 20, 50, 'wander');
    }
    return null;
  }

  function pickWanderGoal(agent, minDist, maxDist, type) {
    const span = Math.max(1, maxDist - minDist);
    const rng = Math.random();
    const dist = minDist + Math.floor(rng * span);
    const angle = Math.random() * Math.PI * 2;
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

  // Auto-start the simulation
  intervalId = setInterval(tick, tickMs);
  console.log(`[simulation] auto-started - tick interval ${tickMs}ms`);

  function getStatus() {
    return {
      tickCount,
      tickMs,
      agentCount: agents.listAll().length,
      deathCount,
    };
  }

  singleton = {
    getStatus,
  };

  return singleton;
}

module.exports = { createSimulation };
