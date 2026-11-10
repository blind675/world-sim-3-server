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
  if (state.simulation.worldId !== undefined &&
    (typeof state.simulation.worldId !== 'string' || !/^[0-9a-f-]{36}$/.test(state.simulation.worldId))) {
    throw new Error('Invalid snapshot world ID');
  }
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

function createSnapshotStore(directory, config, objectCatalog, { legacyConfig = null } = {}) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const primary = path.join(directory, FILE);
  const backup = `${primary}.bak`;
  const resetMarker = `${primary}.reset`;
  const configHash = signature(config);
  const legacyHash = legacyConfig ? signature(legacyConfig) : null;
  let primaryValid = true;

  function decode(filename) {
    const document = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (document.version !== VERSION) throw new Error(`Snapshot version ${document.version} is incompatible with version ${VERSION}`);
    if (document.configHash !== configHash && document.configHash !== legacyHash) {
      throw new Error('Snapshot world seed/configuration mismatch');
    }
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
    // A reset marker wins over both older snapshots. If the process stopped
    // between the two replacements, finish the reset before exposing a world.
    if (fs.existsSync(resetMarker)) {
      let state;
      try { state = decode(resetMarker); }
      catch (error) { throw new Error(`Pending world reset is corrupt: ${error.message}`); }
      const document = fs.readFileSync(resetMarker, 'utf8');
      writeAtomic(primary, document);
      writeAtomic(backup, document);
      fs.unlinkSync(resetMarker);
      syncDirectory();
      return state;
    }
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

  function syncDirectory() {
    const dfd = fs.openSync(directory, 'r');
    try { fs.fsyncSync(dfd); } finally { fs.closeSync(dfd); }
  }

  function writeAtomic(filename, document) {
    const temp = path.join(directory, `.${path.basename(filename)}.${process.pid}.${crypto.randomUUID()}.tmp`);
    try {
      const fd = fs.openSync(temp, 'wx', 0o600);
      try { fs.writeFileSync(fd, document); fs.fsyncSync(fd); }
      finally { fs.closeSync(fd); }
      fs.renameSync(temp, filename);
      syncDirectory();
    } finally {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
  }

  function encode(state) {
    assertState(state);
    const checksum = crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex');
    return JSON.stringify({ version: VERSION, configHash, catalogHash: objectCatalog.hash, checksum, state });
  }

  function save(state) {
    if (fs.existsSync(resetMarker)) throw new Error('Cannot save while a world reset is pending');
    const document = encode(state);
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
      syncDirectory();
    } finally {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
      if (fs.existsSync(backupTemp)) fs.unlinkSync(backupTemp);
    }
  }

  function reset(state) {
    const document = encode(state);
    // Persist the intended fresh world first. Until the marker is removed,
    // startup always restores it, never an older backup.
    writeAtomic(resetMarker, document);
    writeAtomic(primary, document);
    writeAtomic(backup, document);
    fs.unlinkSync(resetMarker);
    syncDirectory();
    primaryValid = true;
  }
  return { load, save, reset, primary, backup, resetMarker };
}

module.exports = { createSnapshotStore };
