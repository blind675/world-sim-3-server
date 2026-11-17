# Milestone 8 agent-template baseline

The [full JSON report](survival-m8.json) comes from `npm run baseline -- --output docs/baselines/survival-m8.json`. It uses the standard three seeds, 50 agents per seed, and 2,500 offline ticks. The comparison is the [milestone 7 climate baseline](survival-m7.md) with the same settings. The runner never starts the HTTP server or touches a production snapshot volume.

| Seed | Drank | Alive at tick 2,500 | Total travel | Change from M7 | Tick p95 | Peak sampled RSS | Snapshot pair at tick 2,500 | Pair increase from M7 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20260420 | 50/50 | 50/50 | 1,009,175 m | 0 m | 184 ms | 359 MiB | 2.97 MiB | 5,374 bytes |
| 20260421 | 50/50 | 50/50 | 994,664 m | 0 m | 192 ms | 420 MiB | 3.17 MiB | 5,374 bytes |
| 20260422 | 50/50 | 50/50 | 998,158 m | 0 m | 205 ms | 406 MiB | 3.26 MiB | 5,374 bytes |

The active-day travel distribution, total travel, idle ticks, and survival outcomes are identical to milestone 7 for all three seeds. Adding the template and per-agent `templateId`, `birthTick`, and `lifespanDays` increased each final primary snapshot by 2,687 bytes for 50 agents, roughly 54 bytes per agent. The primary-plus-backup pair increased by 5,374 bytes. Tick p95 remains far below the deployed 20-second tick interval. Timing and sampled RSS vary with machine load; these runs shared the environment with automated checks and a local browser test, so they are capacity estimates, not a live Railway measurement. The measured peaks remain below 512 MiB, but Railway memory and snapshot size should still be monitored after release.

Focused tests restored an old snapshot shape with `age:0` and no agent template fields, preserved its agent state, and replayed the next tick across a day boundary. Another test rejects a changed template for both pinned and legacy snapshots. All 53 backend tests passed. Web lint, build, and nine tests passed; mobile typecheck, four tests, and iOS/Android Expo exports passed. A local Chromium check at 1,280 px desktop and 390 px mobile confirmed agent selection, centering, details, and no page-level horizontal overflow. Native-device interaction remains unverified; it needs an Expo device or simulator.

Age and life stages are observational. Births, inherited offspring traits, and age-related death are deferred to milestones 9 and 10. The existing 1 GiB volume and 512 MiB single backend instance remain reasonable starting points; no new service is required. Back up the Railway snapshot volume before a `main` release and deploy backend first, then the two viewers. The browser and app use only read-only fields; neither can edit the live template.
