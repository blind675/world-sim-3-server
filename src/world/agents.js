'use strict';

// In-memory agent store for Milestone 3.
//
// Initial agents are spawned deterministically from the world seed. Each
// agent keeps an A* path and traverses a bounded
// segment of it every two ticks. Chunk indexes hold the segment endpoint.

const { splitmix32 } = require('../utils/prng');
const { wrap } = require('../utils/wrap');
const { circadianTypeFor, effectiveVisionRange } = require('./rhythm');
const { temperatureAt } = require('./climate');
const { loadAgentTemplate } = require('./agentTemplate');
const crypto = require('node:crypto');

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

function createAgentStore(config, terrain, chunkIndex, agentTemplate = loadAgentTemplate()) {
  const { width, height, chunkSize, seed, agents: agentCfg } = config;
  const deepWaterThreshold = agentCfg.deepWaterThreshold;
  const desiredCount = agentCfg.count;
  const moveCellsPerStep = agentCfg.moveCellsPerStep || 1;

  const byId = new Map();
  const all = []; // preserves spawn order
  const defaultTraits = Object.fromEntries(Object.entries(agentTemplate.inheritedTraits)
    .map(([key, bounds]) => [key, bounds.default]));

  function lifespanFor(id) {
    const span = agentTemplate.lifespanDays.max - agentTemplate.lifespanDays.min + 1;
    const sample = crypto.createHash('sha256').update(`${seed}:${id}:lifespan-v1`).digest().readUInt32BE(0);
    return agentTemplate.lifespanDays.min + sample % span;
  }

  function ageAt(agent, tick) {
    return Math.max(0, tick - agent.birthTick) / (config.simulation.ticksPerDay || 360);
  }

  function stageAt(agent, tick) {
    const age = ageAt(agent, tick);
    return [...agentTemplate.lifeStages].reverse().find(stage => age >= stage.startDay).id;
  }

  function makeAgent({ id, x, y, facing, sex, birthTick = 0, lifespanDays = lifespanFor(id),
    traits = { ...defaultTraits, circadianType: circadianTypeFor(seed, id) }, parentIds = [] }) {
    return {
      id, x, y, facing, sex,
      templateId: agentTemplate.id, birthTick, lifespanDays, parentIds,
      lastBirthTick: null,
      state: 'idle', currentGoal: null, currentAction: null,
      behaviorState: null, behaviorCooldowns: {}, targetId: null,
      path: [], pathIndex: 0, inventory: [], memory: [],
      hunger: 0, thirst: 0, tiredness: 0, dead: false,
      actionTargetId: null, actionTicksRemaining: 0,
      traits,
      movementStartPos: null, movementStartTick: null, targetPos: null,
      currentMovementStep: 0, movementTargetIndex: null,
      _cx: Math.floor(x / chunkSize), _cy: Math.floor(y / chunkSize),
    };
  }

  function addAgent(agent) {
    if (byId.has(agent.id)) throw new Error(`Duplicate agent ID ${agent.id}`);
    byId.set(agent.id, agent);
    all.push(agent);
    chunkIndex.addAgentId(agent._cx, agent._cy, agent.id);
    return agent;
  }

  function spawnOffspring(data) {
    if (all.some(a => a.x === data.x && a.y === data.y)
      || !isCellPathable(terrain.cellAt(data.x, data.y), deepWaterThreshold)) {
      throw new Error('Birth cell must be free and walkable');
    }
    return addAgent(makeAgent(data));
  }


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
      addAgent(makeAgent({ id, x, y,
        facing: Math.floor(rng() * 4) * (Math.PI / 2),
        sex: rng() < 0.5 ? 'female' : 'male' }));
      spawned++;
    }
  }

  function publicView(a, currentTick) {
    return {
      id: a.id,
      type: 'agent',
      x: a.x,
      y: a.y,
      facing: a.facing,
      sex: a.sex,
      templateId: a.templateId,
      species: agentTemplate.species,
      birthTick: a.birthTick,
      age: Math.floor(ageAt(a, currentTick)),
      ageDays: Math.floor(ageAt(a, currentTick) * 10) / 10,
      lifeStage: stageAt(a, currentTick),
      lifespanDays: a.lifespanDays,
      parentIds: a.parentIds,
      lastBirthTick: a.lastBirthTick,
      state: a.state,
      currentGoal: a.currentGoal,
      currentAction: a.currentAction,
      behavior: a.behaviorState ? { ...a.behaviorState } : null,
      targetId: a.targetId,
      actionTargetId: a.actionTargetId,
      actionTicksRemaining: a.actionTicksRemaining,
      hunger: a.hunger,
      thirst: a.thirst,
      tiredness: a.tiredness,
      dead: a.dead,
      traits: a.traits,
      effectiveVisionRange: effectiveVisionRange(a, config, currentTick),
      temperatureC: Math.round(temperatureAt(config, terrain.cellAt(a.x, a.y).height, currentTick) * 10) / 10,
      pathLength: a.path.length,
      pathIndex: a.pathIndex,
      pathRemaining: Math.max(0, a.path.length - a.pathIndex),
      // Full path for frontend animation
      path: a.path.slice(a.pathIndex), // Include remaining path from current position
      // Movement data for interpolation
      movementStartPos: a.movementStartPos,
      targetPos: a.targetPos,
      movementStartTick: a.movementStartTick,
      currentTick: currentTick,
      moveSpeed: a.traits.moveSpeed,
      moveCellsPerStep: Math.max(1, Math.round(moveCellsPerStep * a.traits.moveSpeed)),
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

  function restore(saved, tickCount = 0) {
    byId.clear();
    all.length = 0;
    for (const data of saved) {
      const agent = structuredClone(data);
      agent.templateId ??= agentTemplate.id;
      agent.birthTick ??= 0;
      agent.lifespanDays ??= lifespanFor(agent.id);
      agent.parentIds ??= [];
      agent.lastBirthTick ??= null;
      agent.inventory ??= [];
      delete agent.age; // legacy static field; public age is derived from the saved tick
      if (agent.templateId !== agentTemplate.id || !Number.isSafeInteger(agent.birthTick)
        || agent.birthTick < 0 || agent.birthTick > tickCount
        || !Number.isSafeInteger(agent.lifespanDays)
        || agent.lifespanDays < agentTemplate.lifespanDays.min
        || agent.lifespanDays > agentTemplate.lifespanDays.max) {
        throw new Error(`Snapshot has invalid agent identity or age for ${agent.id}`);
      }
      if (!Array.isArray(agent.parentIds) || ![0, 2].includes(agent.parentIds.length)
        || agent.parentIds.some(id => typeof id !== 'string' || !/^a-\d+$/.test(id) || id === agent.id)
        || (agent.parentIds.length === 2 && agent.parentIds[0] === agent.parentIds[1])
        || (agent.birthTick > 0 && agent.parentIds.length !== 2)
        || (agent.lastBirthTick !== null && (!Number.isSafeInteger(agent.lastBirthTick)
          || agent.lastBirthTick < agent.birthTick || agent.lastBirthTick > tickCount))) {
        throw new Error(`Snapshot has invalid parent or cooldown state for ${agent.id}`);
      }
      agent.behaviorState ??= null;
      agent.behaviorCooldowns ??= {};
      if (!agent.traits || typeof agent.traits !== 'object') {
        throw new Error(`Snapshot has invalid traits for ${agent.id}`);
      }
      agent.traits.circadianType ??= circadianTypeFor(seed, agent.id);
      if (agent.traits.circadianType !== 'diurnal' && agent.traits.circadianType !== 'nocturnal') {
        throw new Error(`Snapshot has invalid circadian preference for ${agent.id}`);
      }
      for (const [key, bounds] of Object.entries(agentTemplate.inheritedTraits)) {
        if (!Number.isFinite(agent.traits[key]) || agent.traits[key] < bounds.min
          || agent.traits[key] > bounds.max) throw new Error(`Snapshot has invalid ${key} for ${agent.id}`);
      }
      agent.movementTargetIndex ??= null;
      agent._cx = Math.floor(agent.x / chunkSize);
      agent._cy = Math.floor(agent.y / chunkSize);
      addAgent(agent);
    }
  }

  function setPath(agent, path) {
    agent.path = path || [];
    agent.pathIndex = 0;
    agent.movementStartPos = null;
    agent.movementStartTick = null;
    agent.targetPos = null;
    agent.movementTargetIndex = null;
    if (agent.path.length > 0) {
      agent.state = 'moving';
      agent.currentAction = 'move_to_target';
    } else {
      agent.state = 'idle';
      agent.currentAction = null;
    }
  }

  // Start or complete one bounded path segment. The start tick exposes its
  // path to viewers; the following tick commits the segment endpoint.
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
      agent.movementTargetIndex = null;
      return false;
    }

    const targetIndex = agent.movementStartPos
      ? (agent.movementTargetIndex ?? agent.pathIndex)
      : Math.min(agent.path.length - 1,
        agent.pathIndex + Math.max(1, Math.round(moveCellsPerStep * agent.traits.moveSpeed)) - 1);
    const next = agent.path[targetIndex];
    const nx = wrap(next.x, width);
    const ny = wrap(next.y, height);

    // Record movement start for new step
    if (!agent.movementStartPos) {
      agent.movementStartPos = { x: agent.x, y: agent.y };
      agent.movementStartTick = currentTick;
      agent.targetPos = { x: nx, y: ny };
      agent.movementTargetIndex = targetIndex;
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
    agent.x = nx;
    agent.y = ny;
    agent.pathIndex = targetIndex + 1;
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
      agent.movementTargetIndex = null;
    } else {
      // Clear movement data for this step but prepare for next step
      agent.movementStartPos = null;
      agent.targetPos = null;
      agent.movementStartTick = null;
      agent.currentMovementStep = 0;
      agent.movementTargetIndex = null;
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
    spawnOffspring,
    listAll,
    getById,
    setPath,
    stepAgent,
    stepAll,
    publicView,
    detailView,
    removeById,
    restore,
  };
}

module.exports = { createAgentStore, isCellPathable };
