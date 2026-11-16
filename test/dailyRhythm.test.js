'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { buildConfig } = require('../src/config/worldConfig');
const { createWorld } = require('../src/world/world');
const { createPerception } = require('../src/world/perception');
const { pickUrgentNeed } = require('../src/world/needs');
const { circadianTypeFor, lightAt, effectiveVisionRange } = require('../src/world/rhythm');

function smallConfig() {
  const base = buildConfig();
  return { ...base, width: 128, height: 128, agents: { ...base.agents, count: 1 } };
}

test('clock drives light and opposing sleep preferences; thirst still wins', () => {
  const config = smallConfig();
  assert.deepEqual(lightAt(0), { phase: 'night', level: 0.55 });
  assert.deepEqual(lightAt(180), { phase: 'day', level: 1 });
  assert.deepEqual(lightAt(360), lightAt(0));
  const diurnal = { traits: { circadianType: 'diurnal' }, tiredness: 0.3, hunger: 0, thirst: 0 };
  const nocturnal = { ...diurnal, traits: { circadianType: 'nocturnal' } };
  assert.equal(pickUrgentNeed(diurnal, config, 180), null);
  assert.equal(pickUrgentNeed(diurnal, config, 300)?.goal, 'seek_rest');
  assert.equal(pickUrgentNeed(nocturnal, config, 180)?.goal, 'seek_rest');
  assert.equal(pickUrgentNeed(nocturnal, config, 300), null);
  assert.equal(pickUrgentNeed({ ...diurnal, thirst: 0.2 }, config, 300)?.goal, 'seek_water');
  assert.ok(Array.from({ length: 100 }, (_, i) => circadianTypeFor(config.seed, `a-${i + 1}`))
    .includes('nocturnal'));
});

test('night and fatigue shrink real perception while preserving near vision', () => {
  const config = smallConfig();
  const agent = { id: 'a-1', x: 20, y: 20, facing: 0, tiredness: 0,
    traits: { visionRange: 20, circadianType: 'diurnal' } };
  const objects = { queryRect: () => [
    { id: 'near', type: 'food', x: 23, y: 20 },
    { id: 'far', type: 'food', x: 35, y: 20 },
  ] };
  const terrain = { waterDepthAt: () => 0,
    cellAt: () => ({ blocksVision: false, waterDepth: 0, groundType: 'ground' }) };
  const perception = createPerception({ config, objects, terrain,
    chunkIndex: { chunksInRect: () => [] }, agents: {}, objectCatalog: null });
  assert.equal(effectiveVisionRange(agent, config, 180), 20);
  assert.equal(effectiveVisionRange(agent, config, 0), 11);
  assert.deepEqual(perception.perceiveAgent(agent, 180).map(v => v.id), ['near', 'far']);
  assert.deepEqual(perception.perceiveAgent(agent, 0).map(v => v.id), ['near']);
  agent.traits.circadianType = 'nocturnal';
  assert.equal(effectiveVisionRange(agent, config, 0), 16);
  assert.deepEqual(perception.perceiveAgent(agent, 0).map(v => v.id), ['near', 'far']);
  agent.traits.circadianType = 'diurnal';
  agent.tiredness = 1;
  assert.ok(effectiveVisionRange(agent, config, 180) < 20);
  assert.ok(effectiveVisionRange(agent, config, 0) >= config.perception.nearRadius);
});

test('agents actually rest mainly in their preferred half of a simulated day', () => {
  const config = smallConfig();
  for (const circadianType of ['diurnal', 'nocturnal']) {
    const world = createWorld({ config, snapshotDir: null, autoStart: false });
    const agent = world.agents.listAll()[0];
    agent.traits.circadianType = circadianType;
    const rested = { day: 0, night: 0 };
    for (let i = 0; i < 360; i++) {
      agent.hunger = 0;
      agent.thirst = 0;
      world.simulation.tick();
      if (agent.state === 'resting') rested[world.simulation.getStatus().light.phase]++;
    }
    const preferred = circadianType === 'diurnal' ? 'night' : 'day';
    const other = preferred === 'day' ? 'night' : 'day';
    assert.ok(rested[preferred] > 20, `${circadianType} barely slept: ${JSON.stringify(rested)}`);
    assert.ok(rested[preferred] > rested[other], `${circadianType} slept at the wrong time: ${JSON.stringify(rested)}`);
  }
});

test('scheduled sleep skips perception and continues exactly after a snapshot', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythm-world-'));
  try {
    const config = smallConfig();
    const world = createWorld({ config, snapshotDir: dir, autoStart: false });
    const agent = world.agents.listAll()[0];
    agent.traits.circadianType = 'diurnal';
    agent.tiredness = 0.3;
    world.simulation.restore({ ...world.simulation.snapshot(), tickCount: 299 });
    world.simulation.tick();
    assert.equal(agent.state, 'resting');
    assert.equal(agent.behaviorState?.id, 'seek_rest');
    const remaining = agent.actionTicksRemaining;
    const oldPerceive = world.perception.perceiveAgent;
    world.perception.perceiveAgent = () => { throw new Error('sleeping agent scanned'); };
    world.simulation.tick();
    world.perception.perceiveAgent = oldPerceive;
    assert.equal(agent.actionTicksRemaining, remaining - 1);
    world.saveSnapshot();
    const restored = createWorld({ config, snapshotDir: dir, autoStart: false });
    assert.equal(restored.agents.listAll()[0].traits.circadianType, 'diurnal');
    assert.equal(restored.simulation.getStatus().light.phase, 'night');
    for (let i = 0; i < 30; i++) {
      world.simulation.tick();
      restored.simulation.tick();
      assert.deepEqual(restored.snapshotState(), world.snapshotState());
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a pre-rhythm snapshot gains the same preference without resetting progress', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhythm-upgrade-'));
  try {
    const config = smallConfig();
    const world = createWorld({ config, snapshotDir: dir, autoStart: false });
    world.simulation.tick();
    world.saveSnapshot();
    const primary = path.join(dir, 'world.json');
    const document = JSON.parse(fs.readFileSync(primary, 'utf8'));
    delete document.state.agents[0].traits.circadianType;
    document.checksum = crypto.createHash('sha256').update(JSON.stringify(document.state)).digest('hex');
    fs.writeFileSync(primary, JSON.stringify(document));
    const restored = createWorld({ config, snapshotDir: dir, autoStart: false });
    assert.equal(restored.simulation.getStatus().tickCount, 1);
    assert.equal(restored.agents.listAll()[0].traits.circadianType,
      circadianTypeFor(config.seed, 'a-1'));
    assert.equal(restored.agents.listAll()[0].x, world.agents.listAll()[0].x);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
