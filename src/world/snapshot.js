'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VERSION = 1;
const FILE = 'world.json';

function signature(config) {
  const { terrainCacheMaxChunks, ...durableConfig } = config;
  return crypto.createHash('sha256').update(JSON.stringify(durableConfig)).digest('hex');
}

function assertState(state) {
  const integer = (n) => Number.isSafeInteger(n) && n >= 0;
  if (!state || !state.simulation || !state.objects || !Array.isArray(state.agents)
    || !Array.isArray(state.deaths) || !integer(state.simulation.tickCount)
    || !integer(state.simulation.deathCount) || !integer(state.simulation.rngState)
    || !integer(state.objects.dynamicCounter) || !integer(state.objects.spreadRngState)
    || !Array.isArray(state.objects.dynamicFood)) throw new Error('Invalid snapshot state');
  for (const name of ['foodStock', 'regrowsAt', 'resourceQueues', 'agentWaitingFor', 'resourceUsers']) {
    if (!Array.isArray(state.objects[name]) || !state.objects[name].every(e => Array.isArray(e) && e.length === 2)) {
      throw new Error(`Invalid snapshot ${name}`);
    }
  }
  const ids = new Set();
  for (const a of state.agents) {
    if (!a || typeof a.id !== 'string' || ids.has(a.id) || !integer(a.x) || !integer(a.y)
      || !Array.isArray(a.path) || !Array.isArray(a.memory) || !a.traits) throw new Error('Invalid snapshot agent');
    ids.add(a.id);
  }
}

function createSnapshotStore(directory, config, objectCatalog) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const primary = path.join(directory, FILE);
  const backup = `${primary}.bak`;
  const configHash = signature(config);
  let primaryValid = true;

  function decode(filename) {
    const document = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (document.version !== VERSION) throw new Error(`Snapshot version ${document.version} is incompatible with version ${VERSION}`);
    if (document.configHash !== configHash) throw new Error('Snapshot world seed/configuration mismatch');
    if (document.catalogHash !== undefined && document.catalogHash !== objectCatalog.hash) {
      throw new Error('Snapshot object catalogue mismatch; restore the pinned catalogue or start a new world');
    }
    if (document.catalogHash === undefined && !objectCatalog.legacyCompatible) {
      throw new Error('Snapshot object catalogue mismatch: legacy snapshot requires the built-in catalogue');
    }
    const bytes = JSON.stringify(document.state);
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== document.checksum) throw new Error('Snapshot checksum mismatch');
    assertState(document.state);
    return document.state;
  }

  function load() {
    const exists = fs.existsSync(primary);
    const hasBackup = fs.existsSync(backup);
    if (!exists && !hasBackup) return null;
    if (exists) {
      try { return decode(primary); }
      catch (error) {
        if (/incompatible|mismatch/.test(error.message) && !/checksum/.test(error.message)) throw error;
        if (!hasBackup) throw new Error(`Snapshot is corrupt: ${error.message}`);
        primaryValid = false;
        console.error(`[snapshot] primary invalid (${error.message}); restoring last-known-good backup`);
      }
    }
    try { return decode(backup); }
    catch (error) { throw new Error(`Snapshot and backup are unusable: ${error.message}`); }
  }

  function save(state) {
    assertState(state);
    const checksum = crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex');
    const document = JSON.stringify({ version: VERSION, configHash, catalogHash: objectCatalog.hash, checksum, state });
    const temp = path.join(directory, `.${FILE}.${process.pid}.${crypto.randomUUID()}.tmp`);
    const backupTemp = `${temp}.bak`;
    try {
      const fd = fs.openSync(temp, 'wx', 0o600);
      try { fs.writeFileSync(fd, document); fs.fsyncSync(fd); }
      finally { fs.closeSync(fd); }
      if (primaryValid && fs.existsSync(primary)) {
        fs.copyFileSync(primary, backupTemp);
        const bfd = fs.openSync(backupTemp, 'r');
        try { fs.fsyncSync(bfd); } finally { fs.closeSync(bfd); }
        fs.renameSync(backupTemp, backup);
      }
      fs.renameSync(temp, primary);
      primaryValid = true;
      const dfd = fs.openSync(directory, 'r');
      try { fs.fsyncSync(dfd); } finally { fs.closeSync(dfd); }
    } finally {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
      if (fs.existsSync(backupTemp)) fs.unlinkSync(backupTemp);
    }
  }
  return { load, save, primary, backup };
}

module.exports = { createSnapshotStore };
