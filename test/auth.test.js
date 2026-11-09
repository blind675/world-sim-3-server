'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../src/app');
const { getWorld } = require('../src/world/world');

test('production control routes require a valid bearer token', async () => {
  const previous = { mode: process.env.NODE_ENV, token: process.env.CONTROL_API_TOKEN, dir: process.env.SNAPSHOT_DIR };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'world-auth-'));
  process.env.NODE_ENV = 'production';
  process.env.CONTROL_API_TOKEN = 'test-only-control-secret';
  process.env.SNAPSHOT_DIR = dir;
  const server = createApp().listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const catalogue = await (await fetch(base + '/api/object-definitions')).json();
    assert.equal(catalogue.schemaVersion, 1);
    assert.ok(catalogue.definitions.some(def => def.id === 'pine_tree'));
    assert.match(catalogue.hash, /^[0-9a-f]{64}$/);
    const objects = await (await fetch(base + '/api/entities/in-view?x=0&y=0&w=64&h=64&types=tree,rock,food')).json();
    assert.ok(objects.objects.length > 0);
    assert.ok(objects.objects.every(object => catalogue.definitions.some(def => def.id === object.definitionId && def.behavior === object.type)));
    let food = objects.objects.find(object => object.type === 'food');
    for (let cy = 0; cy < 8 && !food; cy++) {
      for (let cx = 0; cx < 8 && !food; cx++) {
        food = getWorld().objects.getObjectsInChunk(cx, cy).find(object => object.type === 'food');
      }
    }
    assert.ok(food, 'test world has a food node');
    const foodUrl = base + `/api/entities/${food.id}`;
    const initialFood = await (await fetch(foodUrl)).json();
    assert.equal(initialFood.food.stock, initialFood.food.capacity);
    assert.equal(initialFood.food.depleted, false);
    const ordinary = objects.objects.find(object => object.type !== 'food');
    assert.ok(ordinary, 'test world has a non-food object');
    const ordinaryDetail = await (await fetch(base + `/api/entities/${ordinary.id}`)).json();
    assert.equal(ordinaryDetail.definitionId, ordinary.definitionId);
    assert.equal(ordinaryDetail.food, undefined);
    for (let i = 0; i < initialFood.food.capacity; i++) getWorld().objects.consumeFood(food.id, 0);
    const depletedFood = await (await fetch(foodUrl)).json();
    assert.equal(depletedFood.food.stock, 0);
    assert.equal(depletedFood.food.depleted, true);
    assert.ok(depletedFood.food.ticksUntilRegrow > 0);
    const list = await (await fetch(base + '/api/agents')).json();
    const agent = list.agents[0];
    assert.equal(agent.type, 'agent');
    const view = await (await fetch(base + `/api/entities/in-view?x=${agent.x}&y=${agent.y}&w=2&h=2&types=agent`)).json();
    assert.ok(view.objects.some(entity => entity.id === agent.id && entity.type === 'agent'));
    assert.ok(Number.isFinite(view.serverTime));
    assert.ok(Number.isFinite(view.lastTickAt));
    const detail = await (await fetch(base + `/api/agents/${agent.id}`)).json();
    assert.ok(Number.isFinite(detail.serverTime));
    assert.ok(Number.isFinite(detail.lastTickAt));
    for (const route of ['/api/agents/a-1/path', '/api/sim/step', '/api/admin/world/reset']) {
      const denied = await fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      assert.equal(denied.status, 401);
      const accepted = await fetch(base + route, { method: 'POST', headers: { authorization: 'Bearer test-only-control-secret', 'content-type': 'application/json' }, body: '{}' });
      assert.notEqual(accepted.status, 401);
      assert.notEqual(accepted.status, 500);
    }
    const beforeReset = await (await fetch(base + '/api/simulation/status')).json();
    const stale = await fetch(base + '/api/admin/world/reset', {
      method: 'POST', headers: { authorization: 'Bearer test-only-control-secret', 'content-type': 'application/json' },
      body: JSON.stringify({ confirmation: 'RESET WORLD', worldId: 'stale' }),
    });
    assert.equal(stale.status, 409);
    const reset = await fetch(base + '/api/admin/world/reset', {
      method: 'POST', headers: { authorization: 'Bearer test-only-control-secret', 'content-type': 'application/json' },
      body: JSON.stringify({ confirmation: 'RESET WORLD', worldId: beforeReset.worldId }),
    });
    assert.equal(reset.status, 200);
    const resetResult = await reset.json();
    assert.equal(resetResult.current.tickCount, 0);
    assert.notEqual(resetResult.current.worldId, beforeReset.worldId);
    const oversized = await fetch(base + '/api/world/chunks', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chunks: Array.from({ length: 9 }, (_, cx) => ({ cx, cy: 0 })) }),
    });
    assert.equal(oversized.status, 400);
    const hugeView = await fetch(base + '/api/entities/in-view?x=0&y=0&w=2048&h=2048');
    assert.equal(hugeView.status, 400);
    delete process.env.CONTROL_API_TOKEN;
    const unavailable = await fetch(base + '/api/sim/step', { method: 'POST' });
    assert.equal(unavailable.status, 503);
  } finally {
    getWorld().stop();
    server.close();
    server.closeAllConnections();
    if (previous.mode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.mode;
    if (previous.token === undefined) delete process.env.CONTROL_API_TOKEN; else process.env.CONTROL_API_TOKEN = previous.token;
    if (previous.dir === undefined) delete process.env.SNAPSHOT_DIR; else process.env.SNAPSHOT_DIR = previous.dir;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
