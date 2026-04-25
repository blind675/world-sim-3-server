// Store for agent death records with timestamps and causes
// Tracks death statistics without location data

let singleton = null;

function createDeathStore() {
  if (singleton) return singleton;

  const deaths = []; // Array of death records
  const maxDeaths = 1000; // Limit to prevent memory growth

  function addDeath(agentId, tick, cause) {
    const death = {
      id: `death:${agentId}:${tick}`,
      agentId,
      tick,
      cause, // 'hunger', 'thirst', 'tiredness'
      timestamp: Date.now(),
    };

    deaths.push(death);

    // Remove oldest deaths if we exceed the limit
    if (deaths.length > maxDeaths) {
      deaths.splice(0, deaths.length - maxDeaths);
    }

    return death;
  }

  function getAll() {
    return [...deaths];
  }

  function getRecent(limit = 50) {
    return deaths.slice(-limit);
  }

  function clear() {
    deaths.length = 0;
  }

  singleton = {
    addDeath,
    getAll,
    getRecent,
    clear,
  };

  return singleton;
}

module.exports = { createDeathStore };
