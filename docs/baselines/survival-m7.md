# Milestone 7 climate baseline

The [full JSON report](survival-m7.json) comes from `npm run baseline -- --output docs/baselines/survival-m7.json`. It advances 50 agents in each of seeds 20260420, 20260421, and 20260422 for 2,500 offline ticks, with no API requests or production volume writes. Compare it with the same settings in the [milestone 6 daily-rhythm result](survival-m6.md). The runner writes temporary primary and backup snapshots at tick 0 and every 500 ticks.

Temperature was checked before weather was added: the [temperature-only checkpoint](survival-m7-temperature-only.json) ran seed 20260420 for 720 ticks with the day/elevation curve and bounded metabolism changes, while weather remained clear. All 50 agents drank and survived. They travelled 308,536 m, about 1.3% above milestone 6's first two days for the same seed. This was an intermediate code checkpoint, not a separate production model. Focused tests cover the cold and heat multipliers, including a cold front applied in the real simulation tick loop.

The full run includes clear days, heatwaves, and rain: seed 20260420 has two heatwave days and one rainy day; seed 20260421 has one of each; seed 20260422 has two rainy days. The standard seeds do not include a cold front in their first seven days, so a separate [cold-front JSON report](survival-m7-cold.json) ran seed 20260402 for 720 ticks, both days cold. All 50 agents drank and survived that run, travelling 305,341 m. Tick p95 was 195 ms and the tick-720 snapshot pair was 2.09 MiB. This extra run checks short-term cold survival, not a matched milestone 6 comparison for that seed.

| Seed | Drank | Alive at tick 2,500 | Median active agent-day travel | Total travel | Change from M6 | Tick p95 | Peak sampled RSS | Snapshot pair at tick 2,500 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20260420 | 50/50 | 50/50 | 2,893 m | 1,009,175 m | +0.7% | 179 ms | 364 MiB | 2.97 MiB |
| 20260421 | 50/50 | 50/50 | 2,848 m | 994,664 m | −0.4% | 178 ms | 458 MiB | 3.16 MiB |
| 20260422 | 50/50 | 50/50 | 2,824 m | 998,158 m | −0.8% | 184 ms | 464 MiB | 3.26 MiB |

All 150 agents discovered terrain water and drank, with no deaths over 6.94 simulated days. Active-day walking remains within the 2–5 km target and close to milestone 6. Tick p95 is well below the deployed 20-second interval. The primary-plus-backup snapshot pair stays near 3 MiB, because weather and temperature are calculated from tick, seed, and terrain instead of stored as a world grid. No database, new volume, or extra backend replica is needed.

These seeds run sequentially in one process. Later RSS peaks can include memory retained from earlier worlds; they do not measure a live Railway instance or long-term growth. The first seed's 364 MiB peak is closer to an isolated world and is similar to milestone 6. Continue monitoring Railway RSS, tick time, and snapshot size after release. No season, regional weather, rainfall-driven water change, or direct temperature death is implemented. The climate formula is pinned with a snapshot model version and an older snapshot restores through a tested compatibility path.

Backend tests, web lint/build/tests, and mobile typecheck/tests/iOS-Android exports passed. A live browser and native-device smoke test remain unverified in this cloud environment because viewer tools were unavailable. No new environment variable is required. Before a `main` release, back up the Railway snapshot volume and deploy backend first, then web and mobile; the new viewer fields are optional and read-only.
