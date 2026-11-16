# Milestone 5 behavior baseline

The [JSON report](survival-m5.json) was generated with `npm run baseline -- --output docs/baselines/survival-m5.json`. It advances 50 agents in each of seeds 20260420, 20260421, and 20260422 for 2,500 offline ticks (about 6.94 simulated days) with no server timer or production volume writes. Compare with the [milestone 4 result](survival-m4.md). CPU and RSS measurements depend on the machine; later seeds run in the same process and may inherit memory retained by earlier worlds.

The new scheduler adds ten-tick idle sequences, twenty-tick look-around sequences, weighted exploration, and interruptible named survival policies. The runner does not yet tally behavior IDs individually, so travel, idle state, drinking, and survival are proxies for behavioral impact. Focused tests verify the exact stay/turn sequence, urgent interruption, snapshot replay, and catalogue compatibility.

The [first-pass run](survival-m5-first-pass.json) used leisure weights idle 3, look-around 2, explore 5 and a four-tick exploration cooldown. All 150 agents survived, but total travel fell to 460–466 km per seed from 973–977 km in milestone 4. Exploration routes of up to 160 cells finish in about ten ticks at the current walking speed, whereas idle and look-around occupy ten and twenty ticks. The cooldown also forced a stationary choice after each route. The final catalogue weights are idle 1, look-around 1, explore 14, with no exploration cooldown. The full comparison below checks that adjustment rather than treating survival alone as sufficient.

A separate 360-tick spot check with the final catalogue and seed 20260420 counted each living agent's `behaviorState.id` after every tick. The 18,000 agent-tick samples included 767 idle, 1,060 look-around, 9,486 explore, 1,242 seek-water, 4,388 seek-rest, and 1,057 transitions with no active behavior. All 50 agents entered idle, look-around, explore, seek-water, and seek-rest at least once. They travelled 163,336 m in the first simulated day, compared with 153,331 m in milestone 4. This confirms the new policies are observable while preserving the established first-day walking scale; the longer baseline below is the survival check.

## Survival and resource effect

| Seed | Drank | Alive at tick 2,500 | Median active agent-day travel | Total travel | Tick p95 | Peak sampled RSS | Snapshot pair at tick 2,500 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20260420 | 50/50 | 50/50 | 2,890 m | 1,005,568 m | 202 ms | 372 MiB | 2.97 MiB |
| 20260421 | 50/50 | 50/50 | 2,867 m | 1,000,569 m | 214 ms | 469 MiB | 3.11 MiB |
| 20260422 | 50/50 | 50/50 | 2,869 m | 1,002,646 m | 244 ms | 477 MiB | 3.02 MiB |

All 150 agents found terrain water, drank, and survived through 6.94 simulated days. Median travel on active agent-days stays inside the proposed 2–5 km walking range and rises only about 3% from milestone 4. An active day means at least 500 m travelled by one agent; partial final days are included by the runner. Idle-state samples fell from roughly 19.2–19.5 thousand to 17.3–17.7 thousand per seed. Tick p95 rose from 188–205 ms to 202–244 ms, still far below the production 20-second interval. The primary-plus-backup snapshot pair stayed near 3 MiB. These observations verify short-term survival and capacity, not long-term population stability.

The 469–477 MiB sequential-process RSS peaks can include memory retained from preceding worlds. The isolated seed check below is more relevant to a single deployed instance.

## Isolated memory check

The [isolated seed 20260422 report](survival-m5-isolated.json), from `npm run baseline -- --seeds 20260422 --output docs/baselines/survival-m5-isolated.json`, reproduced 50 drinkers, 50 survivors, and 1,002,646 m of travel. Peak sampled RSS was **371 MiB**, compared with 375 MiB for the isolated milestone 4 run. Tick p95 was 227 ms, and the snapshot pair was 3.02 MiB. A 512 MiB instance therefore still has measured room for this 2,500-tick world, though live viewers, longer runs, and future reproduction can increase memory. Keep the persistent volume and monitor Railway RSS, snapshot growth, and tick time after release. No new deployment environment variable is required for the built-in catalogue.

## Deployment note

The exact checked-in behavior catalogue accepts a snapshot written before this milestone. It resumes the existing agent state and pins the catalogue hash on the next save. A different behavior catalogue fails restoration unless a migration or intentional reset is provided. Back up the persistent volume before releasing the backend. Deploy backend first so both viewers can read the optional behavior field; the web and mobile changes only display it and keep production read-only.
