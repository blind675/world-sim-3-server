'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { buildConfig } = require('../src/config/worldConfig');
const { createWorld } = require('../src/world/world');
const { loadAgentTemplate, validateAgentTemplate } = require('../src/world/agentTemplate');

function config() {
  const base = buildConfig();
  return { ...base, width: 128, height: 128, chunkSize: 32,
    agents: { ...base.agents, count: 2 },
    simulation: { ...base.simulation, tickMs: 100000 } };
}

test('agent template validates identity, age stages, and inherited bounds', () => {
  const original = loadAgentTemplate().publicView();
  assert.equal(original.lifeStages[1].id, 'adult');
  assert.match(original.hash, /^[0-9a-f]{64}$/);
  const { hash, ...data } = original;
  assert.throws(() => validateAgentTemplate({ ...data, lifeStages: [
    data.lifeStages[0], { id: 'adult', startDay: 0 }, data.lifeStages[2],
  ] }), /life stages/);
  assert.throws(() => validateAgentTemplate({ ...data, inheritedTraits: {
    ...data.inheritedTraits, moveSpeed: { default: 1, min: 2, max: 3 },
  } }), /trait bounds/);
});

test('deployed snapshot shape migrates without moving agents, then replays across a day boundary', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-template-migrate-'));
  try {
    const cfg = config();
    const world = createWorld({ config: cfg, snapshotDir: dir, autoStart: false });
    for (let i = 0; i < 359; i++) world.simulation.tick();
    const agent = world.agents.listAll()[0];
    agent.memory.push({ id: 'known-fruit', kind: 'entity', type: 'food', x: agent.x,
      y: agent.y, firstSeenTick: 0, lastSeenTick: 359, confidence: 0.9 });
    agent.hunger = 0.2;
    world.saveSnapshot();
    const expected = structuredClone(world.snapshotState());
    const primary = path.join(dir, 'world.json');
    const legacy = JSON.parse(fs.readFileSync(primary, 'utf8'));
    delete legacy.agentTemplateHash;
    for (const oldAgent of legacy.state.agents) {
      delete oldAgent.templateId;
      delete oldAgent.birthTick;
      delete oldAgent.lifespanDays;
      oldAgent.age = 0;
    }
    legacy.checksum = crypto.createHash('sha256').update(JSON.stringify(legacy.state)).digest('hex');
    fs.writeFileSync(primary, JSON.stringify(legacy));
    const restored = createWorld({ config: cfg, snapshotDir: dir, autoStart: false });
    assert.deepEqual(restored.snapshotState(), expected);
    const before = restored.agents.publicView(restored.agents.listAll()[0], 359);
    assert.equal(before.age, 0);
    assert.equal(before.lifeStage, 'juvenile');
    assert.equal(before.birthTick, 0);
    assert.equal(before.species, 'Fictional flightless fruit-eating bird');
    assert.equal(restored.agents.publicView(restored.agents.listAll()[0], 30 * 360).lifeStage, 'adult');
    assert.equal(restored.agents.publicView(restored.agents.listAll()[0], 400 * 360).lifeStage, 'elder');
    world.simulation.tick();
    restored.simulation.tick();
    assert.equal(restored.agents.publicView(restored.agents.listAll()[0], 360).age, 1);
    assert.deepEqual(restored.snapshotState(), world.snapshotState());
    restored.saveSnapshot();
    assert.equal(JSON.parse(fs.readFileSync(primary, 'utf8')).agentTemplateHash, loadAgentTemplate().hash);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a changed template cannot silently restore a pinned or unpinned snapshot', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-template-pin-'));
  try {
    const cfg = config();
    createWorld({ config: cfg, snapshotDir: dir, autoStart: false });
    const original = loadAgentTemplate();
    const changed = { ...original, name: 'Different bird', revision: original.revision + 1 };
    delete changed.hash;
    delete changed.publicView;
    const filename = path.join(dir, 'changed-template.json');
    fs.writeFileSync(filename, JSON.stringify(changed));
    assert.throws(() => createWorld({ config: cfg, snapshotDir: dir, agentTemplatePath: filename,
      autoStart: false }), /agent template mismatch/);
    const primary = path.join(dir, 'world.json');
    const legacy = JSON.parse(fs.readFileSync(primary, 'utf8'));
    delete legacy.agentTemplateHash;
    fs.writeFileSync(primary, JSON.stringify(legacy));
    assert.throws(() => createWorld({ config: cfg, snapshotDir: dir, agentTemplatePath: filename,
      autoStart: false }), /agent template mismatch/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
