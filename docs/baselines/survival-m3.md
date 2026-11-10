# Milestone 3 survival baseline

The [version 2 JSON report](survival-m3.json) was generated from server commit `a3cefd2` on `staging` with:

```bash
npm run baseline -- --output docs/baselines/survival-m3.json
```

This offline run starts a fresh 5,120 × 5,120 world with 50 agents for each of seeds 20260420, 20260421, and 20260422. It advances 2,500 ticks per seed without a real-time timer, API requests, or writes to the production volume. At 360 ticks per simulated day, this covers 6 days and 340 ticks (about 6.94 days). Movement uses a one-metre cell scale. A moving agent traverses up to 32 cells every two 10-second live ticks; its maximum moving speed is about 1.6 m/s. Actual travel includes time spent seeking, eating, drinking, and resting.

| Seed | Saw terrain water | Drank | Alive at tick 2,500 | Thirst deaths | Median travel per active agent-day | Peak sampled RSS | Largest snapshot pair |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20260420 | 42/50 | 42/50 | 39/50 | 11 | 2,830 m | 349 MiB | 2.40 MiB |
| 20260421 | 36/50 | 36/50 | 33/50 | 17 | 2,864 m | 370 MiB | 2.24 MiB |
| 20260422 | 36/50 | 36/50 | 32/50 | 18 | 2,844 m | 372 MiB | 2.44 MiB |

An active agent-day here means at least 500 m travelled during that day. Across the three runs, about 97–98% of those days fall in the proposed 2–5 km range. Mean travel across all 50 agents on day 1 is 3.15–3.20 km. After deaths, cohort-wide daily distance falls; the per-agent records in the JSON make that visible. All recorded deaths were from thirst. Of the 46 deaths, 36 agents never discovered terrain water and 10 had drunk before dying later. The first thirst deaths were at tick 1,081, three simulated days after a fresh start.

The [version 1 baseline](README.md#version-1-reference) had 8, 9, and 13 survivors for these same seeds after 2,500 ticks; 120 of 150 agents died of thirst. That reference used the former need decay and walking settings, and had no simulated-day definition. Survival improves substantially, but the first milestone 3 target is **not met**: only seed 20260420 reaches 80% drinking, and thirst deaths exceed the proposed fewer-than-20% threshold in every seed. This leaves milestone 3 open for a focused follow-up on water discovery and repeat access. Do not treat the stronger survival count as proof that agents can sustain a population indefinitely; reproduction is a later milestone.

`water.discoveredAgents` counts agents that held a reachable shoreline memory at least once. `water.drankAgents` counts agents whose thirst fell while taking a drink action. Fruit hydration is reported separately as `fruitHydrationAgentTicks`. Per-day travel sums the wrapped cell distances during each 360-tick day; the last day is partial. Idle and waiting counts sample the state after each tick. Snapshot measurements include the primary and recovery copy; terrain and static objects are regenerated. CPU and RSS are estimates from one sequential process on this cloud machine, not Railway measurements. The maximum sampled RSS was 372 MiB and the combined snapshot copies stayed under 2.5 MiB in this run. This does not establish a production memory limit or forecast snapshot growth after births are introduced.

The next survival experiment should measure whether undrunk agents simply never cross a shoreline, see it but lose its memory, or fail to follow a remembered path. Then change one of shoreline discovery, water-seeking routes, or hydrated-fruit use and rerun these fixed seeds before marking milestone 3 complete. Keep the checked-in report as the current measured result; do not silently weaken the target.
