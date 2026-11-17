# Milestone 11 inventory measurement

The [raw report](population-m11.json) advances the same three fixed seeds as the [milestone 10 natural run](population-m10.md): 12 founders, a 512 × 512 wrapping world, and 21,960 ordinary ticks (61 simulated days). The command is:

```bash
npm run baseline:population -- --ticks 21960 --width 512 --height 512 --output docs/baselines/population-m11.json
```

The report format is version 2. `foodServingsConsumed` counts successful source stock deductions, including fruit pickup and direct mushroom meals. `fruitPickups` counts transitions into a one-fruit inventory, `carriedMeals` counts surviving agents' transitions back to empty inventory, and `carriedAgentTicks` sums the number of living carriers after each tick. A fruit discarded on death counts as a pickup but not a carried meal. These counts do not include an item's weight or a general inventory economy.

| Seed | M10 alive / births / hunger deaths | M11 alive / births / hunger deaths | M11 fruit pickups / carried meals | M11 carrier ticks | M11 food servings consumed |
| --- | ---: | ---: | ---: | ---: | ---: |
| 20260420 | 9 / 9 / 12 | 15 / 10 / 7 | 229 / 225 | 68,819 | 240 |
| 20260421 | 10 / 8 / 10 | 7 / 4 / 9 | 66 / 65 | 20,375 | 161 |
| 20260422 | 6 / 6 / 12 | 17 / 13 / 8 | 224 / 224 | 63,854 | 250 |

Every seed still has living agents at day 61, although seed 20260421 has three fewer survivors than milestone 10. The other two seeds have more survivors, births, and travel. In each run, carried fruit persists for hundreds of agent-ticks on average; the 0.20 pickup and 0.35 meal thresholds produce actual travel time between pickup and eating. Hunger remains the only recorded death cause during this horizon. The runs do not show steady population balance or guarantee survival beyond day 61.

| Seed | M10 / M11 travel cells | M10 / M11 final memory entries | M10 / M11 tick p95 | M10 / M11 peak sampled RSS | M10 / M11 final snapshot pair |
| --- | ---: | ---: | ---: | ---: | ---: |
| 20260420 | 1,008,299 / 1,308,190 | 441 / 744 | 21.87 / 29.04 ms | 221 / 287 MiB | 170 / 271 KiB |
| 20260421 | 1,115,589 / 822,496 | 452 / 347 | 25.24 / 20.89 ms | 321 / 383 MiB | 162 / 126 KiB |
| 20260422 | 895,273 / 1,432,764 | 289 / 813 | 22.59 / 31.73 ms | 329 / 383 MiB | 108 / 315 KiB |

The larger living populations in two seeds explain much of their extra travel, memory, and snapshot size. Peak sampled RSS stayed below 512 MiB in this offline reduced-world run; the largest sample left about 129 MiB of headroom. The three seeds run sequentially in one Node process, so later RSS includes earlier allocations. Tick timing and RSS are host dependent and are not an isolated production benchmark. The final snapshot pair is the current file plus its last-known-good backup; atomic writes briefly need additional space. A persistent 1 GiB volume remains far above the measured snapshot files, while a 512 MiB instance should be monitored under the default 50-agent, 5,120-cell live world.

The milestone 10 runner did not record food servings. A matching checkout at milestone 10 commit `b6b5f1c` was run for seed 20260420 with the same 12 agents, 512-cell dimensions, and 21,960 ticks. It counted **206 completed-meal calls** to `consumeFood`, versus **240 successful source deductions** in milestone 11 (229 fruit pickups and 11 direct meals): 34 more servings, or about 16.5% more. The reference checkout ended with 9 alive, 9 births, and 12 deaths, matching the checked-in milestone 10 report. Food pressure rose in that seed while the living population rose from 9 to 15; this one-seed comparison does not isolate per-agent appetite from the population and movement changes. Reproduce the reference count by wrapping `world.objects.consumeFood` in the milestone 10 checkout and running the same seed and tick loop.

Automated tests cover last-serving contention, one-item capacity, movement while carrying, hydration and hunger recovery, direct mushroom meals, legacy snapshots, malformed inventories, and deterministic replay after restoring both a carried item and a meal in progress. The backend test suite passed 65/65 tests. Web lint/build and nine tests passed; mobile typecheck, four tests, and iOS/Android exports passed. A local Chromium check at 1,280 px and 390 px showed the carried fruit, source, and action in the read-only web details without horizontal overflow. Native-device interaction and live Railway/Netlify behavior were not tested here.
