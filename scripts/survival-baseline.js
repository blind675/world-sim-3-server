#!/usr/bin/env node
'use strict';

// Offline measurement only: no HTTP server, real-time timer, or production snapshot.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { buildConfig } = require('../src/config/worldConfig');
const { createWorld } = require('../src/world/world');
const { createSnapshotStore } = require('../src/world/snapshot');

const REPORT_VERSION = 2;

function parseArgs(argv) {
  const options = { seeds: [20260420, 20260421, 20260422], ticks: 2500, agents: null,
    width: null, height: null, checkpointEvery: 500, output: null };
  const names = { '--seeds': 'seeds', '--ticks': 'ticks', '--agents': 'agents',
    '--width': 'width', '--height': 'height', '--checkpoint-every': 'checkpointEvery',
    '--output': 'output' };
  for (let i = 0; i < argv.length; i += 2) {
    const key = names[argv[i]];
    if (!key || i + 1 >= argv.length) throw new Error(`Unknown or incomplete option: ${argv[i]}`);
    const value = argv[i + 1];
    if (key === 'output') { options.output = value; continue; }
    if (key === 'seeds') {
      options.seeds = value.split(',').map(Number);
      if (options.seeds.length < 1 || options.seeds.length > 20) throw new Error('Use 1–20 seeds');
    } else options[key] = Number(value);
  }
  for (const seed of options.seeds) {
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Seeds must be uint32 integers');
  }
  for (const key of ['ticks', 'checkpointEvery']) {
    if (!Number.isSafeInteger(options[key]) || options[key] < 1 || options[key] > 100000) {
      throw new Error(`${key} must be an integer in 1–100000`);
    }
  }
  for (const key of ['agents', 'width', 'height']) {
    const max = key === 'agents' ? 1000 : 100000;
    if (options[key] !== null && (!Number.isSafeInteger(options[key]) || options[key] < 1 || options[key] > max)) {
      throw new Error(`${key} must be a positive integer`);
    }
  }
  if (options.output && !options.output.endsWith('.json')) throw new Error('--output must be a .json path');
  return options;
}

function percentile(sorted, fraction) {
  if (!sorted.length) return null;
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}

function firstOrNull(values) {
  const found = values.filter(value => value !== null);
  return found.length ? Math.min(...found) : null;
}

function wrappedTravel(a, b, config) {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return Math.min(dx, config.width - dx) + Math.min(dy, config.height - dy);
}

function configForSeed(base, options, seed) {
  return {
    ...base, seed,
    width: options.width ?? base.width,
    height: options.height ?? base.height,
    agents: { ...base.agents, count: options.agents ?? base.agents.count },
  };
}

function runSeed(baseConfig, options, seed) {
  const config = configForSeed(baseConfig, options, seed);
  // The world runs without a timer or configured volume. Only this temporary
  // store is written, so benchmarking cannot replace a deployed snapshot.
  const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'survival-baseline-'));
  let world;
  try {
    // Explicit null overrides SNAPSHOT_DIR inherited from a developer shell.
    // Production-mode world startup rejects a missing volume, so this offline
    // tool must be run outside NODE_ENV=production.
    world = createWorld({ config, snapshotDir: null, autoStart: false });
    const snapshotStore = createSnapshotStore(temporaryDir, config, world.objectCatalog);
    const agents = new Map(world.agents.listAll().map(agent => [agent.id, {
      firstWaterSeenTick: null, firstDrinkTick: null, drinkTicks: 0, fruitHydrationTicks: 0,
      travelCells: 0, idleTicks: 0, movingTicks: 0, waitingTicks: 0,
      travelCellsByDay: [],
      lifetimeTicks: null, deathCause: null,
    }]));
    const tickMs = [];
    const deathsByCause = {};
    const snapshots = [];
    let peakRssBytes = process.memoryUsage().rss;
    let firstExtinctionTick = null;
    let ticksRun = 0;

    function checkpoint(tick) {
      snapshotStore.save(world.snapshotState());
      const primary = path.join(temporaryDir, 'world.json');
      const backup = `${primary}.bak`;
      snapshots.push({ tick, primaryBytes: fs.statSync(primary).size,
        backupBytes: fs.existsSync(backup) ? fs.statSync(backup).size : 0 });
      peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
    }

    checkpoint(0);
    const cpuStart = process.cpuUsage();
    const wallStart = performance.now();
    for (let tick = 1; tick <= options.ticks; tick++) {
      const before = new Map(world.agents.listAll().map(agent => [agent.id, {
        x: agent.x, y: agent.y, thirst: agent.thirst, state: agent.state,
        path: agent.path, pathIndex: agent.pathIndex,
      }]));
      const start = performance.now();
      world.simulation.tick();
      tickMs.push(performance.now() - start);
      ticksRun = tick;

      for (const agent of world.agents.listAll()) {
        const previous = before.get(agent.id);
        const metrics = agents.get(agent.id);
        if (previous) {
          const distance = previous.path === agent.path && agent.pathIndex > previous.pathIndex
            ? agent.pathIndex - previous.pathIndex : wrappedTravel(previous, agent, config);
          metrics.travelCells += distance;
          const dayIndex = Math.floor((tick - 1) / (config.simulation.ticksPerDay || 360));
          metrics.travelCellsByDay[dayIndex] = (metrics.travelCellsByDay[dayIndex] || 0) + distance;
          if (distance) metrics.movingTicks++;
          if (agent.thirst < previous.thirst) {
            if (previous.state === 'drinking') {
              metrics.drinkTicks++;
              if (metrics.firstDrinkTick === null) metrics.firstDrinkTick = tick;
            } else if (previous.state === 'eating') metrics.fruitHydrationTicks++;
          }
        }
        if (agent.state === 'idle') metrics.idleTicks++;
        if (agent.state === 'waiting') metrics.waitingTicks++;
        if (metrics.firstWaterSeenTick === null && agent.memory.some(m => m.type === 'water_source')) {
          metrics.firstWaterSeenTick = tick;
        }
      }
      // The store retains only 1,000 records, so collect this tick's deaths
      // before later ticks can evict them.
      for (const death of world.deaths.getAll().filter(record => record.tick === tick)) {
        const metrics = agents.get(death.agentId);
        if (metrics) {
          metrics.lifetimeTicks = death.tick;
          metrics.deathCause = death.cause;
        }
        deathsByCause[death.cause] = (deathsByCause[death.cause] || 0) + 1;
      }
      if (tick % 10 === 0) peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
      if (tick % options.checkpointEvery === 0) checkpoint(tick);
      if (world.agents.listAll().length === 0) {
        firstExtinctionTick = tick;
        break;
      }
    }
    if (snapshots.at(-1).tick !== ticksRun) checkpoint(ticksRun);
    const wallMs = performance.now() - wallStart;
    const cpu = process.cpuUsage(cpuStart);
    tickMs.sort((a, b) => a - b);
    const agentResults = Object.fromEntries(agents);
    const values = Object.values(agentResults);
    const died = values.filter(a => a.lifetimeTicks !== null);
    const lifespans = died.map(a => a.lifetimeTicks).sort((a, b) => a - b);
    const sum = field => values.reduce((total, a) => total + a[field], 0);
    const travelCellsByDay = Array.from({ length: Math.ceil(ticksRun / (config.simulation.ticksPerDay || 360)) },
      (_, day) => values.reduce((total, a) => total + (a.travelCellsByDay[day] || 0), 0));
    return {
      seed, initialAgents: agents.size, ticksRun, survivingAgents: world.agents.listAll().length,
      firstExtinctionTick, deathsByCause,
      water: { discoveredAgents: values.filter(a => a.firstWaterSeenTick !== null).length,
        drankAgents: values.filter(a => a.firstDrinkTick !== null).length,
        firstDiscoveryTick: firstOrNull(values.map(a => a.firstWaterSeenTick)),
        firstDrinkTick: firstOrNull(values.map(a => a.firstDrinkTick)) },
      lifespanTicks: { medianOfDead: percentile(lifespans, 0.5), maxOfDead: lifespans.at(-1) ?? null },
      activity: { travelCells: sum('travelCells'), idleAgentTicks: sum('idleTicks'),
        movingAgentTicks: sum('movingTicks'), waitingAgentTicks: sum('waitingTicks'),
        drinkAgentTicks: sum('drinkTicks'), fruitHydrationAgentTicks: sum('fruitHydrationTicks'),
        travelCellsByDay },
      performance: { wallMs: +wallMs.toFixed(2), cpuMs: +(cpu.user / 1000 + cpu.system / 1000).toFixed(2),
        tickP50Ms: +percentile(tickMs, 0.5).toFixed(2),
        tickP95Ms: +percentile(tickMs, 0.95).toFixed(2),
        peakSampledRssBytes: peakRssBytes },
      snapshots, agents: agentResults,
    };
  } finally {
    world?.stop();
    fs.rmSync(temporaryDir, { recursive: true, force: true });
  }
}

function run(options) {
  const baseConfig = buildConfig();
  const { seed: ignoredSeed, ...worldConfig } = configForSeed(baseConfig, options, 0);
  const report = {
    reportVersion: REPORT_VERSION,
    method: 'offline manual ticks; fresh world per seed; no API requests or production volume writes',
    limits: 'Idle/waiting count post-tick states; RSS is sampled in one process across seeds, not a true per-world high-water mark. Timing varies by machine.',
    settings: { ticks: options.ticks, checkpointEvery: options.checkpointEvery, worldConfig },
    seeds: options.seeds.map(seed => runSeed(baseConfig, options, seed)),
  };
  return report;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = run(options);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) {
    fs.mkdirSync(path.dirname(path.resolve(options.output)), { recursive: true });
    fs.writeFileSync(options.output, json);
  } else process.stdout.write(json);
  for (const result of report.seeds) {
    console.error(`seed ${result.seed}: ${result.ticksRun} ticks, ${result.survivingAgents}/${result.initialAgents} alive, `
      + `${result.water.discoveredAgents} saw water, ${result.water.drankAgents} drank, `
      + `deaths ${JSON.stringify(result.deathsByCause)}, ${result.performance.wallMs} ms wall`);
  }
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { parseArgs, wrappedTravel, runSeed, run };
