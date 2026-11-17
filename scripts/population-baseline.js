#!/usr/bin/env node
'use strict';

// Offline population measurement. Never opens the production volume or HTTP server.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { buildConfig } = require('../src/config/worldConfig');
const { createWorld } = require('../src/world/world');
const { createSnapshotStore } = require('../src/world/snapshot');
const { loadReproductionPolicy } = require('../src/world/reproductionPolicy');

function parseArgs(argv) {
  const values = { mode: 'natural', seeds: [20260420, 20260421, 20260422],
    ticks: 31 * 360, agents: 12, width: 256, height: 256, output: null, policyPath: null };
  const keys = { '--mode': 'mode', '--seeds': 'seeds', '--ticks': 'ticks',
    '--agents': 'agents', '--width': 'width', '--height': 'height', '--output': 'output',
    '--policy-path': 'policyPath' };
  for (let i = 0; i < argv.length; i += 2) {
    const key = keys[argv[i]];
    if (!key || argv[i + 1] === undefined) throw new Error(`Unknown or incomplete option: ${argv[i]}`);
    values[key] = key === 'seeds' ? argv[i + 1].split(',').map(Number)
      : key === 'mode' || key === 'output' || key === 'policyPath' ? argv[i + 1] : Number(argv[i + 1]);
  }
  if (!['natural', 'elder'].includes(values.mode)
    || values.seeds.length < 1 || values.seeds.length > 20
    || values.seeds.some(seed => !Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff)
    || !Number.isSafeInteger(values.ticks) || values.ticks < 1 || values.ticks > 300000
    || !Number.isSafeInteger(values.agents) || values.agents < 2 || values.agents > 60
    || !Number.isSafeInteger(values.width) || values.width < 64 || values.width > 5120
    || !Number.isSafeInteger(values.height) || values.height < 64 || values.height > 5120
    || values.output && !values.output.endsWith('.json')) throw new Error('Invalid population baseline options');
  return values;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.ceil(sorted.length * p) - 1] * 100) / 100;
}

function distribution(values) {
  return { min: Math.min(...values), median: percentile(values, .5), max: Math.max(...values) };
}

function wrappedTravel(a, b, config) {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return Math.min(dx, config.width - dx) + Math.min(dy, config.height - dy);
}

function runSeed(options, seed) {
  const base = buildConfig();
  const config = { ...base, seed, width: options.width, height: options.height,
    agents: { ...base.agents, count: options.agents } };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'population-baseline-'));
  let world;
  try {
    world = createWorld({ config, snapshotDir: null, autoStart: false,
      ...(options.policyPath ? { reproductionPolicyPath: options.policyPath } : {}) });
    if (options.mode === 'elder') {
      // Controlled mortality cohort: all founders approach the valid 500-day
      // lower lifespan range. This is not 499 days of ordinary survival.
      world.agents.listAll().forEach((agent, index) => { agent.lifespanDays = 500 + index % 4; });
      world.simulation.restore({ ...world.simulation.snapshot(),
        tickCount: 499 * (config.simulation.ticksPerDay || 360) });
    }
    const store = createSnapshotStore(dir, config, world.objectCatalog,
      { behaviorCatalog: world.behaviorCatalog, agentTemplate: world.agentTemplate,
        reproductionPolicy: world.reproductionPolicy });
    store.save(world.snapshotState());
    const initialSnapshotBytes = fs.statSync(store.primary).size;
    const ticksPerDay = config.simulation.ticksPerDay || 360;
    const startTick = world.simulation.getStatus().tickCount;
    const tickTimes = [];
    const daily = [];
    const causes = {};
    let maxLiving = world.agents.listAll().length;
    let firstExtinctionTick = null;
    let travelCells = 0;
    let peakRssBytes = process.memoryUsage().rss;
    let maxSnapshotBytes = initialSnapshotBytes;
    let ticksRun = 0;
    const everSeenIds = new Set(world.agents.listAll().map(agent => agent.id));
    for (let i = 1; i <= options.ticks; i++) {
      const before = new Map(world.agents.listAll().map(a => [a.id, { x: a.x, y: a.y }]));
      const started = performance.now();
      world.simulation.tick();
      tickTimes.push(performance.now() - started);
      ticksRun = i;
      const tick = startTick + i;
      const residents = world.agents.listAll();
      if (residents.length > world.simulation.getStatus().populationCap
        || new Set(residents.map(agent => agent.id)).size !== residents.length) {
        throw new Error(`Population cap or ID invariant failed at tick ${tick}`);
      }
      for (const agent of residents) {
        if (!before.has(agent.id)) {
          if (everSeenIds.has(agent.id)) throw new Error(`Reused agent ID ${agent.id} at tick ${tick}`);
          everSeenIds.add(agent.id);
        }
      }
      maxLiving = Math.max(maxLiving, residents.length);
      for (const agent of residents) {
        const prior = before.get(agent.id);
        if (prior) travelCells += wrappedTravel(prior, agent, config);
      }
      for (const death of world.deaths.getAll()) {
        if (death.tick === tick) causes[death.cause] = (causes[death.cause] || 0) + 1;
      }
      if (i % 100 === 0) peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
      if (i % ticksPerDay === 0 || i === options.ticks) {
        store.save(world.snapshotState());
        const primaryBytes = fs.statSync(store.primary).size;
        const backupBytes = fs.statSync(store.backup).size;
        maxSnapshotBytes = Math.max(maxSnapshotBytes, primaryBytes, backupBytes);
        daily.push({ elapsedDays: +(i / ticksPerDay).toFixed(2),
          alive: residents.length, births: world.simulation.getStatus().birthCount,
          deaths: world.simulation.getStatus().deathCount, primaryBytes, backupBytes });
      }
      if (!residents.length) { firstExtinctionTick = tick; break; }
    }
    const status = world.simulation.getStatus();
    const residents = world.agents.listAll();
    const ageDays = residents.map(a => (status.tickCount - a.birthTick) / ticksPerDay);
    const traits = Object.fromEntries(Object.keys(world.agentTemplate.inheritedTraits).map(key =>
      [key, residents.length ? distribution(residents.map(a => a.traits[key])) : null]));
    return { seed, ticksRun, elapsedDays: +(ticksRun / ticksPerDay).toFixed(2),
      births: status.birthCount, deaths: status.deathCount, deathsByCause: causes,
      alive: residents.length, maxLiving, populationCap: status.populationCap,
      firstExtinctionTick, ageDays: ageDays.length ? distribution(ageDays) : null,
      traits, travelCells, totalMemoryEntries: residents.reduce((n, a) => n + a.memory.length, 0),
      tickP50Ms: percentile(tickTimes, .5), tickP95Ms: percentile(tickTimes, .95),
      peakSampledRssBytes: peakRssBytes, initialSnapshotBytes,
      finalSnapshotBytes: fs.statSync(store.primary).size,
      finalBackupBytes: fs.statSync(store.backup).size, maxSnapshotBytes, daily };
  } finally {
    world?.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = { reportVersion: 1, mode: options.mode,
    method: options.mode === 'natural' ? 'ordinary ticks from birth' :
      'synthetic 499-day clock advance and founder lifespans 500–503 days, then ordinary ticks',
    limits: 'Offline reduced world/agent settings are not production 5120-cell survival evidence. '
      + 'The elder cohort skips 499 days; timing and RSS are host dependent. Death records retain 1000 entries.',
    settings: options, worldConfig: buildConfig(),
    reproductionPolicyHash: loadReproductionPolicy(options.policyPath || undefined).hash,
    seeds: options.seeds.map(seed => runSeed(options, seed)) };
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) fs.writeFileSync(options.output, json);
  else process.stdout.write(json);
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error); process.exitCode = 1; }
}

module.exports = { parseArgs, runSeed };
