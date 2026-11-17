# Milestone 9 pre-adult survival comparison

The [full JSON report](survival-m9.json) comes from `npm run baseline -- --output docs/baselines/survival-m9.json`. It uses the standard three seeds, 50 founding agents per seed, and 2,500 ordinary ticks. This is the same method and configuration as [milestone 8](survival-m8.md). The ground-bird template reaches adulthood at tick 10,800, so this run checks that the new population machinery leaves pre-adult behavior unchanged; it cannot measure natural births.

| Seed | Drank | Alive at tick 2,500 | Total travel | Difference from M8 | Tick p95 | Peak sampled RSS | Snapshot pair at tick 2,500 | Pair increase from M8 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20260420 | 50/50 | 50/50 | 1,009,175 m | 0 m | 186 ms | 363 MiB | 2.98 MiB | 3,890 bytes |
| 20260421 | 50/50 | 50/50 | 994,664 m | 0 m | 194 ms | 423 MiB | 3.17 MiB | 3,890 bytes |
| 20260422 | 50/50 | 50/50 | 998,158 m | 0 m | 194 ms | 405 MiB | 3.27 MiB | 3,890 bytes |

Every per-agent result in the offline report, total travel, idle ticks, drinking, and survival match milestone 8 exactly. The initial population did not breed before the adult threshold, and the separate birth PRNG did not alter earlier random choices. The new parent/cooldown fields and birth counters added 1,945 bytes to each final 50-agent primary snapshot, or 3,890 bytes for the current plus backup pair. Tick timings and sampled RSS vary with machine load; they are not live Railway measurements. This run shared the host with the mature-population capacity benchmarks.

The [mature-population benchmark](reproduction-m9.md) separately checks births, costs, cap behavior, tick time, and snapshot growth by advancing the clock to adulthood while retaining fresh initial positions and needs. Its results do not establish whether agents naturally survive long enough to breed. That long-run balance and age-related mortality are milestone 10 work.
