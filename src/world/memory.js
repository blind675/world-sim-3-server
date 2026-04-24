'use strict';

// Per-agent memory store for Milestone 4 (+ clustering extension).
//
// Memory entries are a discriminated union:
//
//   { kind: 'entity', id, type, x, y,
//     firstSeenTick, lastSeenTick, confidence }
//
//   { kind: 'cluster', id, type, x, y, radius, count,
//     memberIds: string[], members: {id,x,y}[] /* internal */,
//     firstSeenTick, lastSeenTick, confidence }
//
// Confidence is in [0, 1]. Entries currently visible have confidence == 1.
// Entity entries not seen this tick decay by traits.memoryDecayRate.
// Cluster entries decay at (memoryDecayRate / clusterDecayMultiplier) — i.e.
// the cluster persists much longer than the trees that formed it, matching
// the intuition that you don't forget where the forest is.
// Entries that drop below perception.memoryDecayFloor are dropped.
// If the agent is over traits.memoryCapacity, lowest-confidence entries are
// dropped until back under the cap.

const { wrappedDistance, shortestDelta, wrap } = require('../utils/wrap');

// Types that may collapse into a cluster memory when enough same-type
// individuals are observed close together. Trees form "forests", rocks
// become "outcrops", food becomes "berry patches", and water sources
// become "springs". Agents are intentionally excluded (they move, which
// would staleize clusters immediately).
const CLUSTER_TYPES = new Set(['tree', 'rock', 'food', 'water_source']);

// Each agent needs cluster IDs that are unique at least within its own
// memory; a module-level counter is sufficient because cluster IDs only
// need to be distinct per agent's memory array, and they never leave the
// process.
let clusterCounter = 0;
function nextClusterId(agentId, type) {
  clusterCounter++;
  return `cluster:${type}:${agentId}:${clusterCounter}`;
}

// Compute centroid + enclosing radius of a set of member points on a torus.
// Members are unwrapped relative to the first element to handle the wrap
// seam correctly, then the centroid is re-wrapped into [0, size).
function computeClusterGeometry(members, width, height) {
  if (members.length === 0) return { x: 0, y: 0, radius: 0 };
  const anchor = members[0];
  let sx = 0;
  let sy = 0;
  for (const m of members) {
    sx += anchor.x + shortestDelta(anchor.x, m.x, width);
    sy += anchor.y + shortestDelta(anchor.y, m.y, height);
  }
  const cx = wrap(sx / members.length, width);
  const cy = wrap(sy / members.length, height);
  let r = 0;
  for (const m of members) {
    const d = wrappedDistance(cx, cy, m.x, m.y, width, height);
    if (d > r) r = d;
  }
  return { x: cx, y: cy, radius: r };
}

// Step 1: refresh or insert entries from the latest perception scan.
// Individuals whose id is already a member of a cluster refresh the cluster
// directly instead of creating a duplicate entity entry.
function refreshFromVisible(memory, visible, tick, memberToCluster, byId) {
  const seenNow = new Set();
  for (const v of visible) {
    seenNow.add(v.id);
    const cluster = memberToCluster.get(v.id);
    if (cluster) {
      cluster.lastSeenTick = tick;
      cluster.confidence = 1;
      // Update the stored member position so future cluster-geometry
      // recomputations stay accurate even for movable members (agents are
      // currently excluded from CLUSTER_TYPES, but this keeps the code honest).
      for (const m of cluster.members) {
        if (m.id === v.id) { m.x = v.x; m.y = v.y; break; }
      }
      continue;
    }
    const existing = byId.get(v.id);
    if (existing) {
      existing.x = v.x;
      existing.y = v.y;
      existing.lastSeenTick = tick;
      existing.confidence = 1;
    } else {
      const entry = {
        kind: 'entity',
        id: v.id,
        type: v.type,
        x: v.x,
        y: v.y,
        firstSeenTick: tick,
        lastSeenTick: tick,
        confidence: 1,
      };
      memory.push(entry);
      byId.set(v.id, entry);
    }
  }
  return seenNow;
}

// Step 2: absorb orphan same-type individuals into existing clusters.
// An individual is absorbed if it falls within the cluster's current
// radius plus one clusterRadius buffer, so newly-adjacent sightings can
// still join an existing forest.
function absorbIntoExistingClusters(
  memory,
  memberToCluster,
  clusterRadius,
  width,
  height,
) {
  const absorbedIds = new Set();
  for (const cluster of memory) {
    if (cluster.kind !== 'cluster') continue;
    if (!CLUSTER_TYPES.has(cluster.type)) continue;

    for (const e of memory) {
      if (e.kind !== 'entity') continue;
      if (e.type !== cluster.type) continue;
      if (absorbedIds.has(e.id)) continue;
      const d = wrappedDistance(cluster.x, cluster.y, e.x, e.y, width, height);
      if (d > cluster.radius + clusterRadius) continue;

      cluster.members.push({ id: e.id, x: e.x, y: e.y });
      cluster.memberIds.push(e.id);
      if (e.confidence > cluster.confidence) cluster.confidence = e.confidence;
      if (e.lastSeenTick > cluster.lastSeenTick) cluster.lastSeenTick = e.lastSeenTick;
      if (e.firstSeenTick < cluster.firstSeenTick) cluster.firstSeenTick = e.firstSeenTick;
      absorbedIds.add(e.id);
      memberToCluster.set(e.id, cluster);
    }

    // If we added any members, recompute centroid + radius from the real
    // member positions to keep geometry accurate over time.
    if (absorbedIds.size > 0) {
      const geom = computeClusterGeometry(cluster.members, width, height);
      cluster.x = geom.x;
      cluster.y = geom.y;
      cluster.radius = geom.radius;
      cluster.count = cluster.memberIds.length;
    }
  }

  if (absorbedIds.size > 0) {
    for (let i = memory.length - 1; i >= 0; i--) {
      const e = memory[i];
      if (e.kind === 'entity' && absorbedIds.has(e.id)) memory.splice(i, 1);
    }
  }
}

// Step 3: form new clusters from groups of individuals that don't belong
// to any existing cluster. Single-pass union-find over pairwise distances.
// memoryCapacity caps N at ~50 so O(N²) here is trivial.
function formNewClusters(
  memory,
  memberToCluster,
  agentId,
  clusterRadius,
  clusterMinCount,
  width,
  height,
) {
  for (const type of CLUSTER_TYPES) {
    const items = [];
    for (const e of memory) {
      if (e.kind === 'entity' && e.type === type) items.push(e);
    }
    if (items.length < clusterMinCount) continue;

    const parent = new Array(items.length);
    for (let i = 0; i < items.length; i++) parent[i] = i;
    const find = (i) => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    };
    const union = (a, b) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    };
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const d = wrappedDistance(
          items[i].x, items[i].y,
          items[j].x, items[j].y,
          width, height,
        );
        if (d <= clusterRadius) union(i, j);
      }
    }

    const groups = new Map();
    for (let i = 0; i < items.length; i++) {
      const r = find(i);
      let arr = groups.get(r);
      if (!arr) { arr = []; groups.set(r, arr); }
      arr.push(items[i]);
    }

    for (const group of groups.values()) {
      if (group.length < clusterMinCount) continue;

      const members = group.map((m) => ({ id: m.id, x: m.x, y: m.y }));
      const geom = computeClusterGeometry(members, width, height);
      let maxConf = 0;
      let maxLast = -Infinity;
      let minFirst = Infinity;
      for (const m of group) {
        if (m.confidence > maxConf) maxConf = m.confidence;
        if (m.lastSeenTick > maxLast) maxLast = m.lastSeenTick;
        if (m.firstSeenTick < minFirst) minFirst = m.firstSeenTick;
      }
      const cluster = {
        kind: 'cluster',
        id: nextClusterId(agentId, type),
        type,
        x: geom.x,
        y: geom.y,
        radius: geom.radius,
        count: members.length,
        memberIds: members.map((m) => m.id),
        members,
        firstSeenTick: minFirst,
        lastSeenTick: maxLast,
        confidence: maxConf,
      };

      const ids = new Set(cluster.memberIds);
      for (let i = memory.length - 1; i >= 0; i--) {
        const e = memory[i];
        if (e.kind === 'entity' && ids.has(e.id)) memory.splice(i, 1);
      }
      memory.push(cluster);
      for (const mid of cluster.memberIds) memberToCluster.set(mid, cluster);
    }
  }
}

// Step 4: decay entries not refreshed this tick and drop anything below
// the floor. Clusters count as "seen" if any of their members were seen.
function decayAndFilter(memory, seenNow, entityDecay, clusterDecay, floor) {
  const kept = [];
  for (const entry of memory) {
    if (entry.kind === 'entity') {
      if (!seenNow.has(entry.id)) {
        entry.confidence *= entityDecay;
        if (entry.confidence < floor) continue;
      }
    } else {
      let clusterSeen = false;
      for (const mid of entry.memberIds) {
        if (seenNow.has(mid)) { clusterSeen = true; break; }
      }
      if (!clusterSeen) {
        entry.confidence *= clusterDecay;
        if (entry.confidence < floor) continue;
      }
    }
    kept.push(entry);
  }
  memory.length = 0;
  for (const e of kept) memory.push(e);
}

// Public entry point. Signature takes the full world config so perception
// knobs and world dimensions can both be pulled from one place.
function updateAgentMemory(agent, visible, tick, config) {
  const memory = agent.memory;
  const { memoryDecayRate, memoryCapacity } = agent.traits;
  const perceptionCfg = config.perception;
  const floor = perceptionCfg.memoryDecayFloor;
  const clusterRadius = perceptionCfg.clusterRadius;
  const clusterMinCount = perceptionCfg.clusterMinCount;
  const clusterDecayMultiplier = perceptionCfg.clusterDecayMultiplier || 1;
  const { width, height } = config;

  // Migrate older entries (without a kind field) to the entity variant.
  for (const e of memory) {
    if (!e.kind) e.kind = 'entity';
  }

  // Indices used by refresh / absorb steps.
  const byId = new Map();
  const memberToCluster = new Map();
  for (const entry of memory) {
    if (entry.kind === 'entity') {
      byId.set(entry.id, entry);
    } else if (entry.kind === 'cluster') {
      for (const mid of entry.memberIds) memberToCluster.set(mid, entry);
    }
  }

  const seenNow = refreshFromVisible(memory, visible, tick, memberToCluster, byId);

  absorbIntoExistingClusters(memory, memberToCluster, clusterRadius, width, height);

  formNewClusters(
    memory, memberToCluster, agent.id,
    clusterRadius, clusterMinCount, width, height,
  );

  const entityDecay = 1 - perceptionCfg.entityMemoryDecayRate;
  const clusterDecay = 1 - memoryDecayRate / clusterDecayMultiplier;
  decayAndFilter(memory, seenNow, entityDecay, clusterDecay, floor);

  if (memory.length > memoryCapacity) {
    memory.sort((a, b) => b.confidence - a.confidence);
    memory.length = memoryCapacity;
  }
}

module.exports = {
  updateAgentMemory,
  // Exposed for unit tests / debugging.
  _internals: { computeClusterGeometry, CLUSTER_TYPES },
};
