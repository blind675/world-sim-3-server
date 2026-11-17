#!/usr/bin/env node
'use strict';

// Controlled adult-population capacity run. The clock is advanced to the
// template's adult threshold without simulating the preceding 30 days; this
// measures reproduction behavior, not natural long-term population balance.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { buildConfig } = require('../src/config/worldConfig');
const { createWorld } = require('../src/world/world');
const { createSnapshotStore } = require('../src/world/snapshot');

function parse(argv) {
  const result = { seeds: [20260420, 20260421, 20260422], ticks: 360, output: null };
  for (let i = 0; i < argv.length; i += 2) {
    const option = argv[i];
    if (i + 1 >= argv.length) throw new Error(`Missing value for ${option}`);
    if (option === '--seeds') result.seeds = argv[i + 1].split(',').map(Number);
    else if (option === '--ticks') result.ticks = Number(argv[i + 1]);
    else if (option === '--output') result.output = argv[i + 1];
    else throw new Error(`Unknown option ${option}`);
  }
  if (result.seeds.length < 1 || result.seeds.length > 20
    || result.seeds.some(seed => !Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff)
    || !Number.isSafeInteger(result.ticks) || result.ticks < 1 || result.ticks > 10000
    || result.output && !result.output.endsWith('.json')) throw new Error('Invalid baseline options');
  return result;
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}

function runSeed(seed, ticks) {
  const config = { ...buildConfig(), seed };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reproduction-baseline-'));
  let world;
  try {
    world = createWorld({ config, snapshotDir: null, autoStart: false });
    const adultDay = world.agentTemplate.lifeStages.find(stage => stage.id === 'adult').startDay;
    const firstAdultTick = adultDay * (config.simulation.ticksPerDay || 360);
    world.simulation.restore({ ...world.simulation.snapshot(), tickCount: firstAdultTick - 1 });
    const snapshots = createSnapshotStore(directory, config, world.objectCatalog,
      { agentTemplate: world.agentTemplate, behaviorCatalog: world.behaviorCatalog,
        reproductionPolicy: world.reproductionPolicy });
    snapshots.save(world.snapshotState());
    const initialPrimaryBytes = fs.statSync(snapshots.primary).size;
    let foodServingsConsumed = 0;
    const consumeFood = world.objects.consumeFood;
    world.objects.consumeFood = (...args) => {
      foodServingsConsumed++;
      return consumeFood(...args);
    };
    let waterActionTicks = 0;
    let maxLivingAgents = world.agents.listAll().length;
    let peakSampledRssBytes = process.memoryUsage().rss;
    const tickTimes = [];
    for (let i = 0; i < ticks; i++) {
      const started = performance.now();
      world.simulation.tick();
      tickTimes.push(performance.now() - started);
      const residents = world.agents.listAll();
      waterActionTicks += residents.filter(agent => agent.state === 'drinking').length;
      maxLivingAgents = Math.max(maxLivingAgents, residents.length);
      if (i % 10 === 0) peakSampledRssBytes = Math.max(peakSampledRssBytes, process.memoryUsage().rss);
    }
    snapshots.save(world.snapshotState());
    const finalPrimaryBytes = fs.statSync(snapshots.primary).size;
    const backupBytes = fs.statSync(snapshots.backup).size;
    const status = world.simulation.getStatus();
    return { seed, firstAdultTick, ticksRun: ticks, births: status.birthCount,
      deaths: status.deathCount, finalLivingAgents: status.agentCount,
      maxLivingAgents, populationCap: status.populationCap,
      foodServingsConsumed, waterActionTicks,
      parentHungerCost: +(status.birthCount * 2 * world.reproductionPolicy.hungerCost).toFixed(3),
      parentThirstCost: +(status.birthCount * 2 * world.reproductionPolicy.thirstCost).toFixed(3),
      tickP50Ms: +percentile(tickTimes, 0.5).toFixed(2),
      tickP95Ms: +percentile(tickTimes, 0.95).toFixed(2),
      peakSampledRssBytes, initialPrimaryBytes, finalPrimaryBytes, backupBytes };
  } finally {
    world?.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function main() {
  const options = parse(process.argv.slice(2));
  const report = { reportVersion: 1,
    method: 'offline synthetic adult clock; ordinary initial positions and needs; no HTTP or production volume writes',
    limits: 'The 30 days before adulthood are skipped, so this is a capacity and rule exercise rather than natural survival or stable-population evidence. Timing and RSS vary by machine.',
    settings: options,
    seeds: options.seeds.map(seed => runSeed(seed, options.ticks)) };
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) {
    fs.mkdirSync(path.dirname(path.resolve(options.output)), { recursive: true });
    fs.writeFileSync(options.output, json);
  } else process.stdout.write(json);
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error); process.exitCode = 1; }
}

module.exports = { parse, runSeed };
