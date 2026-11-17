# Milestone 10 population measurement

Milestone 10 activates death at each agent's saved lifespan boundary and widens the reproduction partner radius from 20 to 64 cells. The template still assigns founders 500–700 simulated days. The wider radius is a measured balance adjustment: it raises the chance that surviving adults can pair after 30 days of roaming, while the 60-agent cap, eligibility needs, parental costs, and seven-day cooldown remain unchanged. The built-in milestone 9 policy hash migrates exactly; a different custom policy remains incompatible.

## Runs and interpretation

The [natural run](population-m10-natural.json) uses the three fixed seeds 20260420–20260422, 12 agents, a 512 × 512 wrapping world, and 61 ordinary simulated days. Reproduce it with:

```bash
npm run baseline:population -- --ticks 21960 --width 512 --height 512 --output docs/baselines/population-m10-natural.json
```

The [pre-tuning 512-cell run](population-m10-pre-tuning-512.json) covers the first 31 days with the [archived milestone 9 policy](reproduction-m9-policy.json) and identical world/agent settings. The [256-cell stress run](population-m10-pre-tuning-256.json) uses an even smaller habitat. Reproduce either by passing `--policy-path docs/baselines/reproduction-m9-policy.json`, the listed dimensions, and `--ticks 11160`. At 31 days the old 20-cell radius produced **zero births in all three 512-cell seeds**; 5–6 of 12 founders remained, with all 20 deaths caused by hunger. The 256-cell stress case had one complete extinction near day 7 and two seeds with one survivor at day 31. These reduced habitats expose food and partner sensitivity; they are not predictions for a 5,120 × 5,120 production world.

| Seed | Day 31: births / alive | Day 61: births / hunger deaths / alive | Max alive / cap | Median living age | Travel cells | Memory entries | Tick p95 | Peak sampled RSS | Final snapshot pair |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20260420 | 2 / 7 | 9 / 12 / 9 | 12 / 60 | 61 days | 1,008,299 | 441 | 21.87 ms | 221 MiB | 170 KiB |
| 20260421 | 2 / 8 | 8 / 10 / 10 | 12 / 60 | 30.5 days | 1,115,589 | 452 | 25.24 ms | 321 MiB | 162 KiB |
| 20260422 | 0 / 5 | 6 / 12 / 6 | 12 / 60 | 29.6 days | 895,273 | 289 | 22.59 ms | 329 MiB | 108 KiB |

No seed was extinct by day 61, and the last seed recovered from having no birth at day 31. The live count was still small; the run shows a measured chance of persistence through two maturity windows, **not** a steady population or a guarantee beyond day 61. Founder trait values were fixed at their template defaults; the newborns spread final living vision range to 18–21 cells, memory capacity to 46–52, and move speed to about 0.95–1.05 of default. The raw report includes the per-seed age and all inherited-trait distributions plus daily counts. Travel is the aggregate shortest wrapped cell distance across all living agents, not a distance per bird. Memory entries are the final total across living agents. The three seeds run sequentially in one Node process, so later RSS includes earlier allocations and is a conservative but host-specific observation.

The fixed-seed default-world regression (`npm run baseline -- --seeds 20260420 --ticks 2500 --output /tmp/m10-survival-2500.json`) exactly matched the [milestone 9 report](survival-m9.json) for all 50 surviving agents, water discoveries/drinks, death causes, per-agent activity, and 1,009,175 travel cells. Both final primary and backup sizes matched byte-for-byte (1,536,989 and 1,583,071 bytes). This is expected: 2,500 ticks precede adulthood and minimum lifespan, so the new age check and partner radius do not alter the trajectory. Tick p95 was 188.53 ms versus 186.34 ms in milestone 9; sampled RSS was 362 versus 363 MiB. These performance figures include concurrent offline/browser activity and should not be treated as a precise speed comparison.

The [controlled elder cohort](population-m10-elder.json) starts the same 12 founders at a **synthetic** day 499, gives them valid lifespans of 500–503 days, then runs 2,200 ordinary ticks with the milestone 10 policy:

```bash
npm run baseline:population -- --mode elder --ticks 2200 --output docs/baselines/population-m10-elder.json
```

| Seed | Births | Old-age deaths | Living after 6.1 days | Maximum living | Tick p95 | Peak sampled RSS | Final primary snapshot |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20260420 | 3 | 12 | 3 | 15 | 2.75 ms | 124 MiB | 35 KiB |
| 20260421 | 5 | 12 | 5 | 17 | 2.43 ms | 200 MiB | 57 KiB |
| 20260422 | 5 | 12 | 5 | 17 | 1.91 ms | 226 MiB | 55 KiB |

Every founder in the controlled cohort reached its lifespan and was recorded as `old_age`; 3–5 newborns survived each run. The cohort skips 499 ordinary days and **does not** demonstrate that founders naturally survive to day 500. Old-age deaths are absent from the natural 61-day run because even the minimum lifespan is 500 days.

## Capacity and replay

The runner checks living-ID uniqueness and the population cap after every tick. A milestone 10 synthetic adult check with 50 founders and seed 20260420 (`npm run baseline:births -- --seeds 20260420 --ticks 360`) reached **60/60 agents after 10 births**, with no cap breach; its final primary snapshot was 0.97 MiB. Its tick p95 was 279 ms and sampled RSS was 220 MiB, but it ran alongside the fixed-seed comparison, so timing is contaminated by CPU competition. The [milestone 9 capped 60-agent run](reproduction-m9.md) measured 356 MiB peak sampled RSS and a 1.75 MiB primary snapshot over 2,500 ticks. A separate 300-tick milestone 10 probe with the production-sized 5,120-cell world and 50 founders measured 186 MiB RSS, a 0.77 MiB primary snapshot, and 252 ms tick p95; it is a short startup probe, not a long-run capacity result. At the 20-second production tick, that tick time has ample CPU headroom. The old 60-agent peak leaves about 156 MiB below a 512 MiB memory limit, but it is not a guaranteed bound. Monitor Railway RSS after release and keep the single-instance volume sized for two mature snapshots plus temporary atomic-write files; a 1 GiB volume gives large margin for the measured 1–2 MiB snapshots. Snapshot writes still occur every six ticks by default, so an abrupt crash can lose at most six ticks (two minutes at 20 seconds per tick), while SIGTERM saves immediately.

Tests replay age death through a fresh world, check its tick/cause/count and chunk/resource cleanup, and verify the next tick remains identical. They also restore an exact milestone 9 policy snapshot under the new hash without resetting progress. New death records use `tick` as their deterministic time and set `timestamp` to null; restored legacy records retain their wall timestamp. The statistics API reports the durable cumulative death count and breaks down the most recent 1,000 retained causes, including `old_age`. The web statistics panel shows that distinction.

All 60 backend tests and nine web tests passed. Web lint and build passed. A local Chromium check at 1,280 px and 390 px opened the statistics dialog with an injected old-age count and more than 1,000 deaths; the cause note rendered, the mobile dialog scrolled, and the 390 px page had no horizontal overflow. This checks presentation, not a live Netlify or Railway deployment.

## Limits

The 512-cell natural benchmark is a reduced habitat with 12 founders, so its food pressure, partner distances, tick cost, and memory do not extrapolate directly to the default 5,120-cell, 50-founder world. The controlled elder cohort proves the mortality path but not natural survival to 500 days. Hunger killed 34 founders/descendants across the natural seeds by day 61, even as births replaced some losses. The 512 MiB target is based on offline samples, not live Railway telemetry. No experiment guarantees population survival or rules out extinction in other seeds or after day 61. A production-sized multi-year benchmark remains too expensive for this offline milestone; keep watching birth/death trends and memory in Railway before concluding the balance is stable.
