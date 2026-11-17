'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { buildConfig } = require('../src/config/worldConfig');
const { createWorld } = require('../src/world/world');
const { createReproduction } = require('../src/world/reproduction');
const { loadAgentTemplate } = require('../src/world/agentTemplate');
const { loadReproductionPolicy, validateReproductionPolicy } = require('../src/world/reproductionPolicy');

function config() {
  const base = buildConfig();
  return { ...base, width: 128, height: 128, chunkSize: 32,
    agents: { ...base.agents, count: 2 }, simulation: { ...base.simulation, tickMs: 100000 } };
}

function position(agent, x, y, index, chunkSize) {
  index.removeAgentId(agent._cx, agent._cy, agent.id);
  agent.x = x;
  agent.y = y;
  agent._cx = Math.floor(x / chunkSize);
  agent._cy = Math.floor(y / chunkSize);
  index.addAgentId(agent._cx, agent._cy, agent.id);
}

function arrangePair(world) {
  let cell;
  for (let y = 2; y < world.config.height - 2 && !cell; y++) {
    for (let x = 2; x < world.config.width - 3; x++) {
      if ([-1, 0, 1].every(dx => world.terrain.cellAt(x + dx, y).baseMoveCost < Infinity)) {
        cell = { x, y }; break;
      }
    }
  }
  assert.ok(cell, 'test terrain has three walkable neighboring cells');
  const [mother, father] = world.agents.listAll();
  position(mother, cell.x, cell.y, world.chunkIndex, world.config.chunkSize);
  position(father, cell.x + 1, cell.y, world.chunkIndex, world.config.chunkSize);
  mother.sex = 'female';
  father.sex = 'male';
  for (const parent of [mother, father]) {
    world.agents.setPath(parent, []);
    parent.currentGoal = null;
    parent.behaviorState = null;
    parent.hunger = 0;
    parent.thirst = 0;
  }
  return [mother, father];
}

test('policy validates bounded population, needs costs, and mutations', () => {
  const policy = loadReproductionPolicy();
  assert.match(policy.hash, /^[0-9a-f]{64}$/);
  assert.throws(() => validateReproductionPolicy({ ...policy, maxPopulation: 10000 }), /Invalid/);
  assert.throws(() => validateReproductionPolicy({ ...policy,
    mutation: { ...policy.mutation, moveSpeed: 10 } }), /Invalid/);
});

test('eligible adults produce one bounded newborn and replay the same birth after restore', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reproduction-replay-'));
  try {
    const cfg = config();
    const world = createWorld({ config: cfg, snapshotDir: dir, autoStart: false });
    const [mother, father] = arrangePair(world);
    mother.traits.visionRange = 14;
    father.traits.visionRange = 26;
    mother.traits.moveSpeed = 0.8;
    father.traits.moveSpeed = 1.2;
    mother.lifespanDays = 520;
    father.lifespanDays = 680;
    const matureTick = 30 * 360;
    world.simulation.restore({ ...world.simulation.snapshot(), tickCount: matureTick - 1 });
    world.saveSnapshot();
    const restored = createWorld({ config: cfg, snapshotDir: dir, autoStart: false });
    assert.deepEqual(restored.snapshotState(), world.snapshotState());
    world.simulation.tick();
    restored.simulation.tick();
    assert.deepEqual(restored.snapshotState(), world.snapshotState());
    const newborn = world.agents.getById('a-3');
    assert.ok(newborn);
    assert.equal(newborn.birthTick, matureTick);
    assert.deepEqual(newborn.parentIds, [mother.id, father.id]);
    assert.deepEqual(newborn.memory, []);
    assert.deepEqual(newborn.path, []);
    assert.deepEqual(newborn.inventory, []);
    assert.equal(newborn.hunger, 0);
    assert.equal(newborn.thirst, 0);
    assert.equal(newborn.traits.visionRange >= 18 && newborn.traits.visionRange <= 22, true);
    assert.equal(newborn.traits.moveSpeed >= 0.95 && newborn.traits.moveSpeed <= 1.05, true);
    const template = loadAgentTemplate();
    for (const [key, bounds] of Object.entries(template.inheritedTraits)) {
      assert.ok(newborn.traits[key] >= bounds.min && newborn.traits[key] <= bounds.max, key);
    }
    assert.ok(newborn.lifespanDays >= 580 && newborn.lifespanDays <= 620);
    assert.ok(mother.hunger >= 0.08 && father.thirst >= 0.04);
    assert.equal(mother.lastBirthTick, matureTick);
    assert.equal(father.lastBirthTick, matureTick);
    assert.ok(world.chunkIndex.getChunkFromWorld(newborn.x, newborn.y).agentIds.includes(newborn.id));
    assert.equal(world.simulation.getStatus().birthCount, 1);
    assert.equal(world.simulation.getStatus().populationCap, 60);
    assert.equal(world.simulation.snapshot().nextBirthId, 4);
    world.saveSnapshot();
    const after = createWorld({ config: cfg, snapshotDir: dir, autoStart: false });
    assert.deepEqual(after.snapshotState(), world.snapshotState());
    assert.ok(after.chunkIndex.getChunkFromWorld(newborn.x, newborn.y).agentIds.includes(newborn.id));
    for (const version of [world, after]) {
      version.agents.removeById('a-3'); // capacity opens after a child's death
      for (const parent of version.agents.listAll()) {
        version.agents.setPath(parent, []);
        parent.behaviorState = null;
      }
      version.simulation.restore({ ...version.simulation.snapshot(),
        tickCount: matureTick + 7 * 360 - 1 });
      version.simulation.tick();
    }
    assert.ok(world.agents.getById('a-4'));
    assert.equal(world.simulation.getStatus().birthCount, 2);
    assert.deepEqual(after.snapshotState(), world.snapshotState());
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

function harness(overrides = {}) {
  const template = loadAgentTemplate();
  const policy = { ...loadReproductionPolicy(), checkIntervalTicks: 1, maxPopulation: 3,
    partnerRadiusCells: 1, ...overrides.policy };
  const base = { birthTick: 0, lastBirthTick: null, hunger: 0, thirst: 0,
    dead: false, templateId: template.id, traits: Object.fromEntries(
      Object.entries(template.inheritedTraits).map(([key, bounds]) => [key, bounds.default])) };
  const mother = { ...base, id: 'a-1', sex: 'female', x: 0, y: 0, lifespanDays: 600 };
  const father = { ...base, id: 'a-2', sex: 'male', x: 4, y: 0, lifespanDays: 600 };
  const residents = [mother, father];
  const agents = { listAll: () => residents.slice(), spawnOffspring: data => residents.push(data) };
  const terrain = { cellAt: (x, y) => overrides.walkable?.(x, y) === false
    ? { groundType: 'deep_water', waterDepth: 5, baseMoveCost: Infinity }
    : { groundType: 'ground', waterDepth: 0, baseMoveCost: 1 } };
  const engine = createReproduction({ config: { seed: 42, width: 5, height: 5,
    agents: { count: 2, deepWaterThreshold: 1.2 }, simulation: { ticksPerDay: 360 } },
  agents, deaths: { getAll: () => [] }, terrain, agentTemplate: template, reproductionPolicy: policy });
  return { engine, mother, father, residents };
}

test('births require adult opposite-sex neighbors, sufficient needs, a free cell, and room below cap', () => {
  const day30 = 30 * 360;
  const young = harness();
  assert.equal(young.engine.tick(day30 - 1), 0);
  assert.equal(young.residents.length, 2);
  const hungry = harness();
  hungry.mother.hunger = 0.5;
  assert.equal(hungry.engine.tick(day30), 0);
  const thirsty = harness();
  thirsty.father.thirst = 0.5;
  assert.equal(thirsty.engine.tick(day30), 0);
  const cooldown = harness();
  cooldown.mother.lastBirthTick = day30 - 1;
  assert.equal(cooldown.engine.tick(day30), 0);
  const sameSex = harness();
  sameSex.father.sex = 'female';
  assert.equal(sameSex.engine.tick(day30), 0);
  const far = harness();
  far.father.x = 2;
  assert.equal(far.engine.tick(day30), 0);
  const blocked = harness({ walkable: (x, y) => x === 0 && y === 0 || x === 4 && y === 0 });
  assert.equal(blocked.engine.tick(day30), 0);
  const capped = harness({ policy: { maxPopulation: 2 } });
  assert.equal(capped.engine.tick(day30), 0);
  const success = harness();
  assert.equal(success.engine.tick(day30), 1);
  assert.equal(success.mother.hunger, 0.08);
  assert.equal(success.father.hunger, 0.08);
  assert.equal(success.mother.thirst, 0.04);
  assert.equal(success.father.thirst, 0.04);
  const firstChild = structuredClone(success.residents[2]);
  const duplicate = harness();
  assert.equal(duplicate.engine.tick(day30), 1);
  assert.deepEqual(duplicate.residents[2], firstChild);
  assert.deepEqual(duplicate.engine.snapshot(), success.engine.snapshot());
  assert.equal(success.engine.tick(day30 + 1), 0);
  assert.equal(success.residents.length, 3);
  assert.equal(success.engine.snapshot().nextBirthId, 4);
  success.residents.pop(); // a death frees capacity, but never reuses its ID
  assert.equal(success.engine.tick(day30 + 7 * 360), 1);
  assert.equal(success.residents[2].id, 'a-4');
  assert.equal(success.engine.snapshot().birthCount, 2);
});

test('a milestone 8 snapshot migrates birth counters and rejects incompatible policy edits', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reproduction-migrate-'));
  try {
    const cfg = config();
    const world = createWorld({ config: cfg, snapshotDir: dir, autoStart: false });
    world.simulation.tick();
    world.saveSnapshot();
    const primary = path.join(dir, 'world.json');
    const old = JSON.parse(fs.readFileSync(primary, 'utf8'));
    delete old.reproductionHash;
    delete old.state.simulation.birthCount;
    delete old.state.simulation.nextBirthId;
    delete old.state.simulation.birthRngState;
    for (const agent of old.state.agents) {
      delete agent.parentIds;
      delete agent.lastBirthTick;
    }
    old.checksum = crypto.createHash('sha256').update(JSON.stringify(old.state)).digest('hex');
    fs.writeFileSync(primary, JSON.stringify(old));
    const changedLegacy = { ...loadReproductionPolicy(), revision: 3 };
    delete changedLegacy.hash;
    delete changedLegacy.publicView;
    const filename = path.join(dir, 'changed-policy.json');
    fs.writeFileSync(filename, JSON.stringify(changedLegacy));
    assert.throws(() => createWorld({ config: cfg, snapshotDir: dir,
      reproductionPolicyPath: filename, autoStart: false }), /reproduction policy mismatch/);
    const restored = createWorld({ config: cfg, snapshotDir: dir, autoStart: false });
    assert.equal(restored.simulation.getStatus().tickCount, 1);
    assert.equal(restored.simulation.snapshot().nextBirthId, 3);
    assert.equal(restored.simulation.snapshot().birthCount, 0);
    assert.ok(restored.agents.listAll().every(agent => agent.parentIds.length === 0
      && agent.lastBirthTick === null));
    restored.saveSnapshot();
    assert.equal(JSON.parse(fs.readFileSync(primary, 'utf8')).reproductionHash,
      loadReproductionPolicy().hash);
    assert.throws(() => createWorld({ config: cfg, snapshotDir: dir,
      reproductionPolicyPath: filename, autoStart: false }), /reproduction policy mismatch/);
    const broken = JSON.parse(fs.readFileSync(primary, 'utf8'));
    broken.state.simulation.nextBirthId = 1;
    broken.checksum = crypto.createHash('sha256').update(JSON.stringify(broken.state)).digest('hex');
    fs.writeFileSync(primary, JSON.stringify(broken));
    fs.rmSync(`${primary}.bak`, { force: true });
    assert.throws(() => createWorld({ config: cfg, snapshotDir: dir, autoStart: false }),
      /Invalid snapshot reproduction counters/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
