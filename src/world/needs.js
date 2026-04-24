'use strict';

// Milestone 5 — survival loop.
//
// Per-tick helpers for needs decay and timed eat/drink/rest actions.
// Needs are stored on the agent as floats in [0, 1] where 0 means fully
// satisfied and 1 means critical. When any need reaches 1.0 the agent is
// marked dead (simulation removes it in the same tick).

const { wrappedDistance } = require('../utils/wrap');

// Maps the goal/action types to the need they satisfy so tickAction can
// stay data-driven.
const ACTION_TO_NEED = Object.freeze({
  eating: 'hunger',
  drinking: 'thirst',
  resting: 'tiredness',
});

// Maps goal.type (set at decision time) -> action state (set on arrival).
const GOAL_TO_ACTION = Object.freeze({
  seek_food: 'eating',
  seek_water: 'drinking',
  seek_rest: 'resting',
});

// Maps the action state -> the object type the agent must be adjacent to.
const ACTION_TO_OBJECT_TYPE = Object.freeze({
  eating: 'food',
  drinking: 'water_source',
  resting: 'rest_spot',
});

// Mutates the agent: advances hunger/thirst/tiredness by one tick and
// clamps to [0, 1]. Sets agent.dead=true if any need reached 1.0.
function decayNeeds(agent, config) {
  const s = config.survival;
  agent.hunger = Math.min(1, agent.hunger + s.hungerDecayRate);
  agent.thirst = Math.min(1, agent.thirst + s.thirstDecayRate);
  agent.tiredness = Math.min(1, agent.tiredness + s.tirednessDecayRate);
  if (agent.hunger >= 1 || agent.thirst >= 1 || agent.tiredness >= 1) {
    agent.dead = true;
  }
}

// Priority-ordered list of (need, goalType, threshold) triples. Thirst
// first, then hunger, then tiredness — water is the most urgent need.
function buildPriorityList(config) {
  const s = config.survival;
  return [
    { need: 'thirst', goal: 'seek_water', threshold: s.thirstThreshold },
    { need: 'hunger', goal: 'seek_food', threshold: s.hungerThreshold },
    { need: 'tiredness', goal: 'seek_rest', threshold: s.tirednessThreshold },
  ];
}

// Maps a need name to the memory entry type that would satisfy it.
const NEED_TO_MEMORY_TYPE = Object.freeze({
  hunger: 'food',
  thirst: 'water_source',
  tiredness: 'rest_spot',
});

// Returns the most urgent need that is above its threshold, or null if
// every need is still comfortable.
function pickUrgentNeed(agent, config) {
  const priorities = buildPriorityList(config);
  // Two-pass: first find any need above its threshold, then among those
  // pick the one with the highest absolute value. Priority order is used
  // purely as a tiebreaker via Array order.
  let best = null;
  for (const p of priorities) {
    const value = agent[p.need];
    if (value < p.threshold) continue;
    if (!best || value > best.value) {
      best = { ...p, value };
    }
  }
  return best;
}

// Pick the highest-confidence memory entry for the given memory type.
// Mirrors the existing pickMemoryTarget logic in simulation.js but is
// kept here so callers don't need to duplicate the filter.
function pickMemoryTargetForType(agent, memoryType) {
  const candidates = agent.memory.filter(
    (m) => m.kind !== 'cluster' && m.type === memoryType,
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.lastSeenTick - a.lastSeenTick;
  });
  return candidates[0];
}

// Called each tick while agent.state is eating / drinking / resting.
// Decrements the matching need by actionRestoreRate. Ends the action when
// the duration elapses OR the need hits 0 OR the target becomes invalid.
// Returns true if the action ended this tick.
function tickAction(agent, objects, config, currentTick) {
  const need = ACTION_TO_NEED[agent.state];
  if (!need) return false;

  const s = config.survival;
  const { width, height } = config;

  // Validate the target still exists and is adjacent.
  const target = agent.actionTargetId ? objects.getById(agent.actionTargetId) : null;
  const targetOk = target
    && wrappedDistance(agent.x, agent.y, target.x, target.y, width, height) <= 1.5
    // Food can become depleted mid-action (another agent consumed the last
    // stock) — treat that as an interrupt.
    && (target.type !== 'food' || objects.isAvailable(target.id, currentTick));
  if (!targetOk) {
    endAction(agent, objects, false, currentTick);
    return true;
  }

  // Apply restoration this tick.
  agent[need] = Math.max(0, agent[need] - s.actionRestoreRate);
  agent.actionTicksRemaining = Math.max(0, agent.actionTicksRemaining - 1);

  // Completion: either duration elapsed or need fully restored.
  if (agent.actionTicksRemaining <= 0 || agent[need] <= 0) {
    endAction(agent, objects, true, currentTick);
    return true;
  }
  return false;
}

// Clean up agent action state and apply depletion to food nodes when a
// visit completes successfully.
function endAction(agent, objects, completed, currentTick) {
  if (completed && agent.state === 'eating' && agent.actionTargetId) {
    // A successful eat consumes one stock; depleted if that was the last.
    objects.consumeFood(agent.actionTargetId, currentTick);
  }
  agent.state = 'idle';
  agent.currentAction = null;
  agent.currentGoal = null;
  agent.actionTargetId = null;
  agent.actionTicksRemaining = 0;
}

// Start an action now that the agent has arrived at the goal location.
// Looks up the nearest valid object of the required type within 1 cell
// (accounting for wrap) and binds it as actionTargetId.
function beginActionIfArrived(agent, objects, config, currentTick) {
  const goal = agent.currentGoal;
  if (!goal) return false;
  const actionState = GOAL_TO_ACTION[goal.type];
  if (!actionState) return false;

  const requiredType = ACTION_TO_OBJECT_TYPE[actionState];
  const { width, height } = config;

  // Look for any matching object within 1.5 cells (Chebyshev-ish) of the
  // agent's current cell. queryRect is wrap-aware; use a small 3x3 window.
  const rectX = agent.x - 1;
  const rectY = agent.y - 1;
  const nearby = objects.queryRect(rectX, rectY, 3, 3, new Set([requiredType]));

  let best = null;
  let bestDist = Infinity;
  for (const o of nearby) {
    if (o.type === 'food' && !objects.isAvailable(o.id, currentTick)) continue;
    const d = wrappedDistance(agent.x, agent.y, o.x, o.y, width, height);
    if (d < bestDist) { bestDist = d; best = o; }
  }
  if (!best) return false;

  // Check if another agent is already using this resource
  const queueLength = objects.getQueueLength(best.id);
  const nextInQueue = objects.getNextInQueue(best.id);

  // If resource is occupied and this agent is not at front of queue, make them wait
  if (queueLength > 0 && !objects.isAtFrontOfQueue(agent.id, best.id)) {
    // Join the queue if not already in it
    objects.joinQueue(agent.id, best.id);
    agent.state = 'waiting';
    agent.currentAction = 'waiting';
    agent.actionTargetId = best.id;
    return true; // Successfully started waiting
  }

  // Resource is available or agent is at front of queue
  agent.state = actionState;
  agent.currentAction = actionState;
  agent.actionTargetId = best.id;
  agent.actionTicksRemaining = config.survival.actionTicks;

  // Remove from queue when starting action
  objects.leaveQueue(agent.id);
  return true;
}

module.exports = {
  decayNeeds,
  tickAction,
  beginActionIfArrived,
  pickUrgentNeed,
  pickMemoryTargetForType,
  NEED_TO_MEMORY_TYPE,
  GOAL_TO_ACTION,
};
