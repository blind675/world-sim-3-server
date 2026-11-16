# Milestone 4 habitat and lifecycle check

The [JSON report](survival-m4.json) comes from `npm run baseline -- --output docs/baselines/survival-m4.json`. It advances 50 agents for 2,500 ticks in each fixed seed (20260420–20260422), without a live timer or production snapshot volume. Compare it with the [milestone 3 water-guide result](survival-m3-water-guide.md). CPU and RSS are cloud-machine estimates; the seeds run sequentially in one process, so later RSS readings can include memory retained from prior runs.

The first 400 chunks (20 × 20, seed 20260420, default 64-cell chunks) contain 13,537 legacy objects and 2,270 new habitat objects, a 16.8% increase. The additions are 1,037 forest mushroom patches, 1,144 fallen-wood pieces, and 89 shore-reed clumps. New objects occupy terrain that matches their ground and height filters. The counts are a local sample, not an extrapolation to every part of the world. Existing object IDs, positions, and definition choices are unchanged in regression tests.

The mushroom patch is a durable static source. After its stock regrows, it may spawn a one-serving dynamic mushroom nearby. This offspring has an expiry tick 360 ticks after birth. The expiry event is rebuilt from its saved `expiresAt` value on restore, and removing it cleans the object index and resource queues. It does not grow or rot merely because someone views a map chunk. A mushroom being eaten when its expiry arrives is interrupted; the agent receives food only after finishing the eat action.

## Survival and resource effect

| Seed | Drank | Alive at tick 2,500 | Thirst deaths | Total travel | Tick p95 | Peak sampled RSS | Snapshot pair at tick 2,500 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20260420 | 50/50 | 50/50 | 0 | 976,750 m | 188 ms | 362 MiB | 3.00 MiB |
| 20260421 | 50/50 | 50/50 | 0 | 975,380 m | 200 ms | 374 MiB | 3.15 MiB |
| 20260422 | 50/50 | 50/50 | 0 | 972,842 m | 205 ms | 479 MiB | 3.25 MiB |

All 150 agents drank and survived, matching the milestone 3 outcome. Total travel increased by 0.3–0.4% per seed. Eating-related hydration ticks stayed at 199–200 per seed; this metric does not distinguish berry meals from mushroom meals. Tick p95 rose from 176–192 ms in milestone 3 to 188–205 ms here, about 7–8% depending on seed; the exact timing depends on the machine and concurrent work. The snapshot pair at tick 2,500 rose by 0.07–0.33 MiB. Primary snapshots are 1.53–1.65 MiB, and the backup accounts for the rest. The 479 MiB RSS value comes from the third world in a sequential run, so it may include memory held by previous worlds. See the isolated run below before sizing a production instance.

This run covers 6.94 simulated days and does not establish long-term population stability or a steady-state count of perishable offspring. Continue monitoring snapshot size, memory, and object density on the single production instance after release.

## Isolated memory check

The [isolated seed 20260422 report](survival-m4-isolated.json), from `npm run baseline -- --seeds 20260422 --output docs/baselines/survival-m4-isolated.json`, reproduced 50 drinkers, 50 survivors, and a 3.25 MiB snapshot pair. Peak sampled RSS was **375 MiB**, compared with 365 MiB in the isolated milestone 3 run. Tick p95 was 189 ms. This suggests a 512 MiB instance still has room for this measured world, though live viewers, longer runs, and future population growth can raise memory use. Monitor Railway RSS and snapshot size after the release; increase memory only if the live measurements require it. Leave ample volume headroom for the primary snapshot, backup, and atomic temporary write. The pair uses 3.25 MiB at 2,500 ticks, so 100 MiB free space is a conservative starting floor rather than a long-term capacity guarantee.

## Deployment note

The backend can restore a snapshot pinned to the exact previous built-in catalogue hash. It preserves the agent population and mutable resources while adding deterministic habitat objects, then writes the new hash at the next snapshot. Back up the persistent volume and release backend first, web second, mobile third. This is a one-time compatibility path for this exact catalogue revision; later changes need another explicit migration or an intentional world reset.
