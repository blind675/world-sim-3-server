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
    for (const route of ['/api/agents/a-1/path', '/api/sim/step']) {
      const denied = await fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      assert.equal(denied.status, 401);
      const accepted = await fetch(base + route, { method: 'POST', headers: { authorization: 'Bearer test-only-control-secret', 'content-type': 'application/json' }, body: '{}' });
      assert.notEqual(accepted.status, 401);
      assert.notEqual(accepted.status, 500);
    }
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
