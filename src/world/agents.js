'use strict';

// In-memory agent store for Milestone 3.
//
// Agents are spawned deterministically from the world seed at startup (no
// runtime respawn yet). Each agent keeps an A* path; callers advance them
// via stepAgent() which consumes one path cell per call. Chunk-index bookkeeping
// is updated whenever an agent crosses a chunk boundary.

const { splitmix32 } = require('../utils/prng');
const { wrap } = require('../utils/wrap');

const DEFAULT_TRAITS = Object.freeze({
  visionRange: 20,
  memoryCapacity: 50,
  memoryDecayRate: 0.01,
  moveSpeed: 1,
});

// A cell is pathable if it's walkable ground and not deep water.
// Mirrors the same predicate used by pathfinding so spawn stays consistent.
function isCellPathable(cell, deepWaterThreshold) {
  if (cell.groundType === 'deep_water') return false;
  if (cell.waterDepth > deepWaterThreshold) return false;
  if (!Number.isFinite(cell.baseMoveCost)) return false;
  return true;
}

function dirFromDelta(dx, dy) {
  // 4-dir only for M3. Facing is angle in radians (0 = +x / east).
  if (dx > 0) return 0;
  if (dx < 0) return Math.PI;
  if (dy > 0) return Math.PI / 2;
  if (dy < 0) return -Math.PI / 2;
  return 0;
}

function createAgentStore(config, terrain, chunkIndex) {
  const { width, height, chunkSize, seed, agents: agentCfg } = config;
  const deepWaterThreshold = agentCfg.deepWaterThreshold;
  const desiredCount = agentCfg.count;

  // --- Collision avoidance (M6) ---
  const AVOIDANCE_DISTANCE = 2; // Minimum distance to maintain between agents
  const AVOIDANCE_FORCE = 0.3; // Strength of repulsion force

  // Calculate repulsion force from nearby agents
  function calculateRepulsionForce(agent, agentMap, chunkIndex) {
    let forceX = 0;
    let forceY = 0;

    // Check nearby chunks for agents
    const bboxX = agent.x - AVOIDANCE_DISTANCE;
    const bboxY = agent.y - AVOIDANCE_DISTANCE;
    const bboxW = AVOIDANCE_DISTANCE * 2 + 1;
    const bboxH = AVOIDANCE_DISTANCE * 2 + 1;

    const chunks = chunkIndex.chunksInRect(bboxX, bboxY, bboxW, bboxH);

    for (const { cx, cy } of chunks) {
      const chunk = chunkIndex.getChunk(cx, cy);
      for (const id of chunk.agentIds) {
        if (id === agent.id) continue;
        const other = agentMap.get(id);
        if (!other) continue;

        // Calculate distance with world wrapping
        let dx = other.x - agent.x;
        let dy = other.y - agent.y;

        // Handle world wrapping
        if (dx > width / 2) dx -= width;
        else if (dx < -width / 2) dx += width;
        if (dy > height / 2) dy -= height;
        else if (dy < -height / 2) dy += height;

        const distance = Math.sqrt(dx * dx + dy * dy);

        // Apply repulsion force if within avoidance distance
        if (distance < AVOIDANCE_DISTANCE && distance > 0) {
          const force = AVOIDANCE_FORCE * (1 - distance / AVOIDANCE_DISTANCE);
          forceX -= (dx / distance) * force;
          forceY -= (dy / distance) * force;
        }
      }
    }

    return { forceX, forceY };
  }

  const byId = new Map();
  const all = []; // preserves spawn order

  function spawnInitial() {
    const rng = splitmix32((seed ^ 0xa11ce0de) >>> 0);
    let attempts = 0;
    const maxAttempts = desiredCount * 2000;
    let spawned = 0;

    // Group configuration
    const maxGroupSize = 7; // Maximum agents per group as requested
    const groupSpawnRadius = 20; // Cells radius for agents within a group

    while (spawned < desiredCount && attempts < maxAttempts) {
      attempts++;

      // Determine if this is a new group or continuing current group
      const isNewGroup = spawned === 0 || (spawned % maxGroupSize === 0 && spawned < desiredCount);

      let x, y;

      if (isNewGroup) {
        // Find a new group center location
        x = Math.floor(rng() * width);
        y = Math.floor(rng() * height);
      } else {
        // Spawn near the previous agent (within group radius)
        const lastAgent = all[spawned - 1];
        const angle = rng() * Math.PI * 2;
        const distance = rng() * groupSpawnRadius;
        x = Math.floor(lastAgent.x + Math.cos(angle) * distance);
        y = Math.floor(lastAgent.y + Math.sin(angle) * distance);

        // Wrap around world boundaries if needed
        x = (x + width) % width;
        y = (y + height) % height;
      }

      const cell = terrain.cellAt(x, y);
      if (!isCellPathable(cell, deepWaterThreshold)) continue;

      // Prefer "nice" ground types so starting cells are believable; skip
      // shallow_water / mud to keep agents on land at spawn.
      if (cell.groundType !== 'ground'
        && cell.groundType !== 'forest_floor'
        && cell.groundType !== 'tall_grass') continue;

      const id = `a-${spawned + 1}`;
      const cx = Math.floor(x / chunkSize);
      const cy = Math.floor(y / chunkSize);
      const agent = {
        id,
        x,
        y,
        facing: 0,
        sex: rng() < 0.5 ? 'female' : 'male',
        age: 0,
        state: 'idle',
        currentGoal: null,
        currentAction: null,
        targetId: null,
        path: [],
        pathIndex: 0,
        inventory: [],
        memory: [],
        hunger: 0,
        thirst: 0,
        tiredness: 0,
        dead: false,
        // M5 timed-action state. When state is eating/drinking/resting,
        // actionTargetId is the object being consumed and ticksRemaining
        // counts down to completion.
        actionTargetId: null,
        actionTicksRemaining: 0,
        traits: { ...DEFAULT_TRAITS },
        // Movement tracking for interpolation
        movementStartPos: null,
        movementStartTick: null,
        targetPos: null,
        currentMovementStep: 0,
        _cx: cx,
        _cy: cy,
      };
      byId.set(id, agent);
      all.push(agent);
      chunkIndex.addAgentId(cx, cy, id);
      spawned++;
    }
  }

  function publicView(a, currentTick) {
    return {
      id: a.id,
      x: a.x,
      y: a.y,
      facing: a.facing,
      sex: a.sex,
      age: a.age,
      state: a.state,
      currentGoal: a.currentGoal,
      currentAction: a.currentAction,
      targetId: a.targetId,
      actionTargetId: a.actionTargetId,
      actionTicksRemaining: a.actionTicksRemaining,
      hunger: a.hunger,
      thirst: a.thirst,
      tiredness: a.tiredness,
      dead: a.dead,
      traits: a.traits,
      pathLength: a.path.length,
      pathIndex: a.pathIndex,
      pathRemaining: Math.max(0, a.path.length - a.pathIndex),
      // Movement data for interpolation
      movementStartPos: a.movementStartPos,
      targetPos: a.targetPos,
      movementStartTick: a.movementStartTick,
      currentTick: currentTick,
      moveSpeed: a.traits.moveSpeed,
      isMoving: a.state === 'moving' && a.movementStartPos !== null,
    };
  }

  function detailView(a, currentTick) {
    return {
      ...publicView(a, currentTick),
      inventory: a.inventory.slice(),
      memory: a.memory.map(serializeMemoryEntry),
      path: a.path.slice(a.pathIndex),
    };
  }

  // Strip backend-only fields (e.g. cluster.members with full per-member
  // positions) so the wire format stays lean. Entity entries pass through
  // unchanged.
  function serializeMemoryEntry(m) {
    if (m.kind !== 'cluster') return m;
    const { members, ...rest } = m;
    return rest;
  }

  function listAll() { return all.slice(); }
  function getById(id) { return byId.get(id) || null; }

  function setPath(agent, path) {
    agent.path = path || [];
    agent.pathIndex = 0;
    if (agent.path.length > 0) {
      agent.state = 'moving';
      agent.currentAction = 'move_to_target';
    } else {
      agent.state = 'idle';
      agent.currentAction = null;
    }
  }

  // Advance agent one cell along its stored path. Returns true if the agent moved.
  function stepAgent(agent, currentTick) {
    if (agent.pathIndex >= agent.path.length) {
      if (agent.state === 'moving') {
        agent.state = 'idle';
        agent.currentAction = null;
      }
      // Clear movement tracking when path complete
      agent.movementStartPos = null;
      agent.targetPos = null;
      agent.currentMovementStep = 0;
      return false;
    }

    const next = agent.path[agent.pathIndex];
    const nx = wrap(next.x, width);
    const ny = wrap(next.y, height);

    // Record movement start for new step
    if (!agent.movementStartPos) {
      agent.movementStartPos = { x: agent.x, y: agent.y };
      agent.movementStartTick = currentTick;
      agent.targetPos = { x: nx, y: ny };
      agent.currentMovementStep = 0;
      agent.state = 'moving'; // Set state to moving

      // Don't immediately update position - let frontend handle interpolation
      // Only update facing direction
      let dx = nx - agent.x;
      let dy = ny - agent.y;
      if (dx > width / 2) dx -= width;
      else if (dx < -width / 2) dx += width;
      if (dy > height / 2) dy -= height;
      else if (dy < -height / 2) dy += height;

      agent.facing = dirFromDelta(dx, dy);
      return true; // Movement started but not completed
    }

    // Movement already in progress - complete it now
    let finalX = nx;
    let finalY = ny;

    // TODO: Apply collision avoidance forces (simplified for now)
    // Collision avoidance will be refined in future iterations

    agent.x = nx;
    agent.y = ny;
    agent.pathIndex++;
    agent.currentMovementStep = 1; // Movement completed for this step

    const ncx = Math.floor(nx / chunkSize);
    const ncy = Math.floor(ny / chunkSize);
    if (ncx !== agent._cx || ncy !== agent._cy) {
      chunkIndex.moveAgent(agent.id, agent._cx, agent._cy, ncx, ncy);
      agent._cx = ncx;
      agent._cy = ncy;
    }

    if (agent.pathIndex >= agent.path.length) {
      agent.state = 'idle';
      agent.currentAction = null;
      // Note: currentGoal is intentionally NOT cleared here. Simulation
      // logic inspects the arrived-at goal to decide whether to begin a
      // timed action (eat/drink/rest) and is responsible for clearing.
      // Clear movement data when path completes
      agent.movementStartPos = null;
      agent.targetPos = null;
      agent.movementStartTick = null;
      agent.currentMovementStep = 0;
    } else {
      // Clear movement data for this step but prepare for next step
      agent.movementStartPos = null;
      agent.targetPos = null;
      agent.movementStartTick = null;
      agent.currentMovementStep = 0;
    }

    // Keep movement tracking data for interpolation - will be updated on next step
    // Don't clear here - let it persist until the next movement step begins

    return true;
  }

  function stepAll(steps = 1, currentTick) {
    const changed = new Set();
    for (let s = 0; s < steps; s++) {
      for (const agent of all) {
        if (stepAgent(agent, currentTick)) changed.add(agent);
      }
    }
    return Array.from(changed);
  }

  // Permanently remove an agent from the store (e.g. on death). Cleans up
  // its chunk-index entry and all byId/all references. Safe to call with
  // an unknown id (no-op).
  function removeById(id) {
    const agent = byId.get(id);
    if (!agent) return false;
    chunkIndex.removeAgentId(agent._cx, agent._cy, id);
    byId.delete(id);
    const idx = all.indexOf(agent);
    if (idx >= 0) all.splice(idx, 1);
    return true;
  }

  return {
    spawnInitial,
    listAll,
    getById,
    setPath,
    stepAgent,
    stepAll,
    publicView,
    detailView,
    removeById,
  };
}

module.exports = { createAgentStore, isCellPathable };
