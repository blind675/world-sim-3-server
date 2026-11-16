# Milestone 6 daily-rhythm baseline

The [JSON report](survival-m6.json) comes from `npm run baseline -- --output docs/baselines/survival-m6.json`. It starts 50 agents in each of seeds 20260420, 20260421, and 20260422, then advances 2,500 ticks per seed in an offline process. It makes no API requests and writes only temporary snapshots. Compare with the same settings in the [milestone 5 baseline](survival-m5.md).

The day/night clock, preferred sleep window, nocturnal adaptation, and fatigue penalty are derived from ticks and agent traits. Focused tests verify that diurnal and nocturnal agents actually rest mainly in opposite halves of the day, that night and fatigue reduce real perception, and that a saved sleeping agent continues identically after restoration. Existing snapshots without a circadian preference load with a deterministic preference based on seed and ID.

| Seed | Drank | Alive at tick 2,500 | Median active agent-day travel | Total travel | Change from M5 | Tick p95 | Peak sampled RSS | Snapshot pair at tick 2,500 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20260420 | 50/50 | 50/50 | 2,860 m | 1,002,340 m | −0.3% | 201 ms | 358 MiB | 3.18 MiB |
| 20260421 | 50/50 | 50/50 | 2,821 m | 998,292 m | −0.2% | 206 ms | 458 MiB | 2.97 MiB |
| 20260422 | 50/50 | 50/50 | 2,881 m | 1,006,242 m | +0.4% | 229 ms | 466 MiB | 3.27 MiB |

All 150 agents discovered terrain water and drank. No agent died in the measured 6.94 simulated days. Walking remains within the 2–5 km active-day target and essentially unchanged from milestone 5. Tick p95 remains well below the 20-second production interval. Primary plus backup snapshots stay near 3 MiB, so a small persistent volume still has ample room at this duration; retain space for growth beyond seven days and off-host backups.

The three seeds run sequentially in one process, so later RSS samples can include memory retained from earlier worlds. The first seed's 358 MiB peak is closer to an isolated instance; the 458–466 MiB peaks do not by themselves establish deployed memory use. Continue monitoring Railway RSS and snapshot growth as the world ages. This baseline does not validate long-term population stability or a live viewer/device frame rate. The web lint, build, and nine tests passed; mobile typecheck, four tests, and iOS/Android Expo exports passed. Browser and native-device interaction still need a manual smoke test in an environment with working viewer tools.

No new deployment variable is required. A backend-first release is needed for both viewers to receive the optional light and effective-vision fields. Back up the persistent snapshot volume before that release. Ordinary work remains on `staging` until an explicit `main` release.
