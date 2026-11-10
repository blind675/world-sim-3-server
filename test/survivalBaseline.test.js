'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildConfig } = require('../src/config/worldConfig');
const { parseArgs, wrappedTravel, runSeed } = require('../scripts/survival-baseline');

test('baseline options reject invalid seeds and unbounded agent counts', () => {
  assert.deepEqual(parseArgs(['--seeds', '7,8', '--ticks', '20']).seeds, [7, 8]);
  assert.throws(() => parseArgs(['--seeds', '-1']), /Seeds must/);
  assert.throws(() => parseArgs(['--agents', '1001']), /positive integer/);
  assert.throws(() => parseArgs(['--ticks', '0']), /ticks must/);
});

test('travel measures the short wrapped route', () => {
  assert.equal(wrappedTravel({ x: 0, y: 9 }, { x: 9, y: 0 }, { width: 10, height: 10 }), 2);
});

test('offline run captures deaths and snapshots without starting a timer', () => {
  const base = buildConfig();
  const config = { ...base, survival: { ...base.survival, thirstDecayRate: 0.5 } };
  const options = { seeds: [7], ticks: 10, agents: 3, width: 128, height: 128, checkpointEvery: 3 };
  const first = runSeed(config, options, 7);
  const second = runSeed(config, options, 7);
  assert.equal(first.initialAgents, 3);
  assert.equal(first.firstExtinctionTick, 2);
  assert.deepEqual(first.deathsByCause, { thirst: 3 });
  assert.equal(first.water.firstDrinkTick, null);
  assert.equal(first.snapshots.at(-1).tick, 2);
  assert.ok(first.snapshots[0].primaryBytes > 0);
  assert.deepEqual(first.agents, second.agents);
  assert.deepEqual(first.deathsByCause, second.deathsByCause);
});

test('ordinary movement metrics replay from a fixed seed', () => {
  const options = { seeds: [7], ticks: 40, agents: 3, width: 128, height: 128, checkpointEvery: 20 };
  const first = runSeed(buildConfig(), options, 7);
  const second = runSeed(buildConfig(), options, 7);
  assert.equal(first.ticksRun, 40);
  assert.ok(first.activity.travelCells > 0);
  assert.deepEqual(first.activity, second.activity);
  assert.deepEqual(first.water, second.water);
  assert.deepEqual(first.agents, second.agents);
});

test('offline runner ignores an inherited production snapshot path', () => {
  const snapshotPath = path.join(os.tmpdir(), `baseline-volume-guard-${process.pid}-${Date.now()}`);
  const original = process.env.SNAPSHOT_DIR;
  process.env.SNAPSHOT_DIR = snapshotPath;
  try {
    runSeed(buildConfig(), { ticks: 2, agents: 1, width: 128, height: 128, checkpointEvery: 1 }, 7);
    assert.equal(fs.existsSync(snapshotPath), false);
  } finally {
    if (original === undefined) delete process.env.SNAPSHOT_DIR;
    else process.env.SNAPSHOT_DIR = original;
  }
});
