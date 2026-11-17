# Agent behavior model (milestone 5)

The backend remains authoritative. The checked-in [behavior catalogue](../config/behavior-catalog.json) defines six fixed policies; `GET /api/behavior-definitions` exposes their validated, read-only descriptions. A production viewer displays the active behavior but cannot change it. `BEHAVIOR_CATALOG_PATH` can select a read-only JSON file at startup. A different catalogue hash requires an explicit snapshot migration or world reset.

## Decision order each tick

1. Refresh perception and memory, then advance needs. A lethal hunger or thirst deficit ends the agent's life.
2. If a survival need becomes urgent, interrupt leisure immediately. Hunger and thirst outrank nonfatal tiredness; the shorter remaining time to the lethal limit wins between the two fatal needs. A more urgent survival need can also interrupt the current survival behavior. Resource queues and movement state are released when interrupted.
3. Continue one tick of an active action, wait, or walking segment. Walking retains the existing two-phase segment timing: one tick starts the visible segment and the next commits its position. Eating, drinking, and resting each advance one action tick.
4. When free, choose the matching survival policy or a weighted eligible leisure policy. Comfort is `1 - max(hunger, thirst, tiredness)`. Cooldowns and `minComfort` filter leisure choices; `idle` is the unconditional fallback. The saved simulation PRNG makes the choice repeatable after restoration.

`idle` is a ten-tick sequence of stay actions. `look_around` takes twenty ticks: four groups of four stays followed by a 90-degree turn. Perception uses the new facing direction on the following tick. `explore` calls the bounded, named terrain route planner. The `seek_food`, `seek_water`, and `seek_rest` definitions name the existing memory, water-guide, pathfinding, and resource-action algorithms. They are not executable code embedded in JSON. A failed route falls back to idle for a tick, then the agent can retry the urgent need. Every definition has a maximum tick budget; look-around has a cooldown, while exploration's route provides its commitment time.

## Data and deployment

The catalogue validator accepts only the six supported IDs and their allowed algorithms. Action sequences have at most 16 steps and a total duration no greater than their declared budget. Steps can only stay or turn; each turn is one tick. Selection weights, comfort thresholds, cooldowns, and budgets have finite bounds. Adding an algorithm requires server code and tests.

Each agent snapshot stores `behaviorState` (`id`, start tick, sequence position, and ticks left in the current step) and `behaviorCooldowns`. The existing simulation PRNG state already persists, so replay after restore chooses the same next behavior. The snapshot header pins the behavior catalogue hash. A snapshot written before this milestone has no behavior hash or behavior fields; it restores with this exact built-in catalogue and gains state as new choices are made. A custom catalogue is deliberately rejected for such a snapshot.

This milestone keeps one agent archetype and its existing survival policies. Day/night preferences, sleep scheduling, temperature, reproduction, and a browser behavior editor remain later work. The catalogue is a bounded policy description, not a general-purpose scripting language.
