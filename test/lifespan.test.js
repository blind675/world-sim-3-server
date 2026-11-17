'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildConfig } = require('../src/config/worldConfig');
const { createWorld } = require('../src/world/world');
const { loadReproductionPolicy } = require('../src/world/reproductionPolicy');

test('lifespan boundary records old age, clears indexes, and replays across a restart', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lifespan-replay-'));
  try {
    const base = buildConfig();
    const config = { ...base, width: 128, height: 128, chunkSize: 32,
      agents: { ...base.agents, count: 2 } };
    const original = createWorld({ config, snapshotDir: directory, autoStart: false });
    const [elder, younger] = original.agents.listAll();
    elder.lifespanDays = 500;
    younger.lifespanDays = 700;
    elder.hunger = 1; // Age is authoritative at the lifespan boundary.
    const boundary = elder.lifespanDays * config.simulation.ticksPerDay;
    original.simulation.restore({ ...original.simulation.snapshot(), tickCount: boundary - 1 });
    original.saveSnapshot();
    const restored = createWorld({ config, snapshotDir: directory, autoStart: false });
    assert.deepEqual(restored.snapshotState(), original.snapshotState());

    for (const world of [original, restored]) {
      assert.equal(world.objects.tryAcquireResource(elder.id, 'test:user'), true);
      assert.equal(world.objects.tryAcquireResource(younger.id, 'test:queue'), true);
      assert.equal(world.objects.tryAcquireResource(elder.id, 'test:queue'), false);
      world.simulation.tick();
      assert.equal(world.agents.getById(elder.id), null);
      assert.equal(world.simulation.getStatus().tickCount, boundary);
      assert.equal(world.simulation.getStatus().deathCount, 1);
      assert.equal(world.agents.listAll().length, 1);
      assert.equal(world.deaths.getAll().at(-1).cause, 'old_age');
      assert.equal(world.deaths.getAll().at(-1).tick, boundary);
      assert.equal(world.chunkIndex.getChunk(elder._cx, elder._cy).agentIds.includes(elder.id), false);
      assert.deepEqual(world.objects.snapshot().agentWaitingFor, []);
      assert.deepEqual(world.objects.snapshot().resourceQueues, []);
      assert.deepEqual(world.objects.snapshot().resourceUsers, [['test:queue', younger.id]]);
      world.objects.releaseResource(younger.id, 'test:queue');
      assert.ok(world.agents.getById(younger.id));
    }
    assert.deepEqual(restored.snapshotState(), original.snapshotState());
    restored.saveSnapshot();
    const resumed = createWorld({ config, snapshotDir: directory, autoStart: false });
    assert.deepEqual(resumed.snapshotState(), restored.snapshotState());
    assert.equal(resumed.simulation.getStatus().birthCount, 0);
    assert.equal(resumed.simulation.getStatus().deathCount, 1);
    resumed.simulation.tick();
    restored.simulation.tick();
    assert.deepEqual(resumed.snapshotState(), restored.snapshotState());
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('an agent below its lifespan still dies from a fatal need', () => {
  const base = buildConfig();
  const config = { ...base, width: 128, height: 128, chunkSize: 32,
    agents: { ...base.agents, count: 1 } };
  const world = createWorld({ config, snapshotDir: null, autoStart: false });
  const agent = world.agents.listAll()[0];
  agent.hunger = 1;
  world.simulation.tick();
  assert.equal(world.deaths.getAll()[0].cause, 'hunger');
});

test('milestone 9 policy snapshot upgrades to the wider partner radius without resetting progress', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lifespan-policy-migration-'));
  try {
    const previousPolicy = { ...loadReproductionPolicy(), revision: 1, partnerRadiusCells: 20 };
    delete previousPolicy.hash;
    delete previousPolicy.publicView;
    const policyPath = path.join(directory, 'm9-policy.json');
    fs.writeFileSync(policyPath, JSON.stringify(previousPolicy));
    const base = buildConfig();
    const config = { ...base, width: 128, height: 128, chunkSize: 32,
      agents: { ...base.agents, count: 2 } };
    const old = createWorld({ config, snapshotDir: directory, reproductionPolicyPath: policyPath,
      autoStart: false });
    old.simulation.tick();
    old.saveSnapshot();
    const previousState = old.snapshotState();
    const upgraded = createWorld({ config, snapshotDir: directory, autoStart: false });
    assert.deepEqual(upgraded.snapshotState(), previousState);
    assert.equal(upgraded.reproductionPolicy.partnerRadiusCells, 64);
    upgraded.saveSnapshot();
    const document = JSON.parse(fs.readFileSync(path.join(directory, 'world.json'), 'utf8'));
    assert.equal(document.reproductionHash, upgraded.reproductionPolicy.hash);
    const resumed = createWorld({ config, snapshotDir: directory, autoStart: false });
    assert.deepEqual(resumed.snapshotState(), previousState);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
