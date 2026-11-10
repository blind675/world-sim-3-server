# Life Simulation v3 roadmap

**Current milestone:** 3 — credible basic survival. **Next:** 4 — habitat and object variety. Milestones 1 and 2 are complete; a native device smoke test remains recommended for milestone 1. This is the canonical progress tracker for the server, web viewer, and native mobile viewer. The deeper [design draft](SIMULATION_DESIGN_DRAFT.md) records the reasoning and future ideas; the historical PRD and build checklist are not a description of current behavior.

All ordinary work, including roadmap updates, is committed to `staging`. `main` changes only for an explicitly requested release. See [release workflow](RELEASE_WORKFLOW.md). The backend owns world state; web and mobile remain read-only production viewers.

## Milestones

- [x] **1. Native mobile map parity.** Use the existing object catalogue and agent timing/path responses to display recognizable bundled object art, a distinct selected-agent marker, and a wrapped route line. Animate movement between polls without frame-by-frame requests. Native device performance and gestures still need a smoke test.
- [x] **2. Survival baseline.** The offline [baseline report](baselines/README.md) covers three fixed seeds, 50 agents each, and 2,500 ticks. It records water discovery and drinking, lifespan and death causes, travel and idle state, CPU/RSS, and snapshot size. Across seeds, 120/150 agents died of thirst at tick 2,001; use these measurements as regression checks.
- [ ] **3. Credible basic survival.** Drink from reachable terrain water beside walkable shoreline, rest where standing, and improve exploration and memory where baseline failures show a need. The first success measure is reliable water discovery and thirst recovery across the test seeds; individual mortality remains expected.
- [ ] **4. Habitat and object variety.** Add a small set of distinct food and material varieties with artwork and placement preferences that influence actual positions, not just selection after placement. Measure density and survival effects, then prove one sparse, snapshot-safe perishable-food lifecycle.
- [ ] **5. Interpretable behavior.** Add a bounded, versioned behavior catalogue for idle, look-around, exploration, and survival policies. Keep complex seeking and pathfinding as named backend algorithms. Define one-tick actions, interruption, and snapshot continuation.
- [ ] **6. Time and climate.** Start with 360 ticks per day (one hour at the default 10-second tick), diurnal and nocturnal sleep preference, and reduced night vision. Calibrate temperature separately before adding weather.
- [ ] **7. Population and interaction.** Add versioned agent templates, aging, bounded inheritance and mutation, resource-limited reproduction, and a population cap. Then add one concrete inventory use case before generalizing items or crafting.

**Mobile selection polish after milestone 1:** a compact agent/object card, persistent map highlight and label, clearer agent details, and optional live food stock are released on `main`. This uses an additive read-only object detail response. Typecheck, tests, and iOS/Android Expo exports passed; tapping, gestures, and frame rate still need a real device or native simulator because this cloud environment has neither.

## Release gates

Each milestone needs relevant automated tests, a manual viewer check when UI changes, and a comparison with the baseline when survival changes. Backend changes must pass snapshot save/restore and deterministic-replay tests. Track CPU, memory, request rate, and snapshot growth for the single-instance deployment.

Snapshots pin the object catalogue and world configuration. For incompatible backend changes, preserve the live world through a tested migration or compatibility path where feasible; back up the snapshot before release. A reset is an explicit last resort, never an automatic fallback. Coordinate releases backend first, web second, mobile third when clients depend on new API fields.

Update the current/next labels and checkboxes only after the milestone's checks pass. Record any validation limits in the commit or release report.
