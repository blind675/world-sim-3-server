'use strict';

const { buildConfig } = require('../config/worldConfig');
const { createTerrain } = require('./terrain');
const { createChunkIndex } = require('./chunkIndex');
const { createObjectStore } = require('./objects');
const { createAgentStore } = require('./agents');
const { createPerception } = require('./perception');
const { createSimulation } = require('./simulation');
const { createDeathStore } = require('./deaths');
const { wrap } = require('../utils/wrap');
const { createSnapshotStore } = require('./snapshot');
const { loadObjectCatalog } = require('./objectCatalog');

let singleton = null;

function createWorld({ config = buildConfig(), legacyConfig, snapshotDir = process.env.SNAPSHOT_DIR, objectCatalogPath, autoStart = true, resetSnapshot = false } = {}) {
  if (process.env.NODE_ENV === 'production' && !snapshotDir) throw new Error('SNAPSHOT_DIR is required in production');
  const interval = Number(process.env.SNAPSHOT_INTERVAL_TICKS || 6);
  if (!Number.isSafeInteger(interval) || interval < 1) throw new Error('SNAPSHOT_INTERVAL_TICKS must be a positive integer');
  const objectCatalog = loadObjectCatalog(objectCatalogPath);
  // Only the known pre-clock default configuration may migrate automatically.
  // Custom configurations require an explicit, exact legacy config; unrelated
  // seeds/settings continue to fail closed.
  const compatibleLegacy = legacyConfig ?? (JSON.stringify(config) === JSON.stringify(buildConfig())
    ? buildConfig({ legacy: true }) : null);
  const snapshotStore = snapshotDir ? createSnapshotStore(snapshotDir, config, objectCatalog,
    { legacyConfig: compatibleLegacy }) : null;
  const saved = resetSnapshot ? null : snapshotStore?.load();
  const terrain = createTerrain(config);

  const chunkIndex = createChunkIndex(config);
  const objects = createObjectStore(config, terrain, chunkIndex, objectCatalog);
  const agents = createAgentStore(config, terrain, chunkIndex);
  const deaths = createDeathStore();
  // Perception needs references to the other stores; build it eagerly so the
  // simulation tick loop can call perceiveAgent() without extra wiring.
  const worldRef = { config, terrain, chunkIndex, objects, agents, objectCatalog };
  const perception = createPerception(worldRef);
  let world;
  const simulation = createSimulation({ config, terrain, chunkIndex, objects, agents, perception, deaths, wrap }, tick => {
    if (tick % interval === 0) world.saveSnapshot();
  });
  world = {
    config, terrain, chunkIndex, objects, agents, perception, simulation, deaths, objectCatalog, wrap,
    snapshotDir, objectCatalogPath,
    snapshotState() {
      return { simulation: simulation.snapshot(), agents: agents.listAll(),
        objects: objects.snapshot(), deaths: deaths.getAll() };
    },
    saveSnapshot() {
      if (snapshotStore) snapshotStore.save(world.snapshotState());
    },
    stop() { simulation.stop(); },
  };
  if (saved) {
    agents.restore(saved.agents);
    objects.restore(saved.objects);
    for (const agent of agents.listAll()) {
      // Old water-source memories point to generated markers. Relearn
      // reachable terrain banks instead of repeatedly seeking a marker.
      agent.memory = agent.memory.filter(m => m.type !== 'water_source'
        || (typeof m.id === 'string' && m.id.startsWith('shore:')));
      if ((agent.state === 'resting' || agent.state === 'drinking') && agent.actionTargetId) {
        objects.removeAgentFromResources(agent.id);
        agent.actionTargetId = null;
        agent.actionTicksRemaining = agent.state === 'resting'
          ? (config.survival.restActionTicks || config.survival.actionTicks)
          : (config.survival.drinkActionTicks || config.survival.actionTicks);
      }
      if (agent.actionTargetId && !objects.ensureById(agent.actionTargetId)) {
        throw new Error(`Snapshot references missing action target ${agent.actionTargetId}`);
      }
    }
    deaths.restore(saved.deaths);
    simulation.restore(saved.simulation);
  } else {
    agents.spawnInitial();
    if (resetSnapshot) snapshotStore?.reset(world.snapshotState());
    else world.saveSnapshot();
  }
  if (autoStart) simulation.start();
  return world;
}

function getWorld() {
  if (!singleton) singleton = createWorld();
  return singleton;
}

function resetWorld() {
  const previous = getWorld();
  previous.stop();
  try {
    const fresh = createWorld({
      config: previous.config,
      snapshotDir: previous.snapshotDir,
      objectCatalogPath: previous.objectCatalogPath,
      autoStart: false,
      resetSnapshot: true,
    });
    singleton = fresh;
    fresh.simulation.start();
    return fresh;
  } catch (error) {
    // A committed reset marker must be recovered before this process can
    // serve or save world state again. The next request retries restoration.
    singleton = null;
    throw error;
  }
}

module.exports = { getWorld, createWorld, resetWorld };
