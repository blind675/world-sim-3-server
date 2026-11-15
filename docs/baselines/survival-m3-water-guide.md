# Milestone 3 water-seeking follow-up

The [JSON report](survival-m3-water-guide.json) was generated from the code in this staging change with:

```bash
npm run baseline -- --output /tmp/survival-water-guide-full.json
```

The checked-in JSON is a copy of that output. As in the [first milestone 3 run](survival-m3.md), the runner advances 50 agents in each of seeds 20260420, 20260421, and 20260422 through 2,500 offline ticks in a 5,120 × 5,120-cell world. A day is 360 ticks, so this covers about 6.94 simulated days. The runner records the development default of 10 seconds per live tick but does not start a timer; production uses 20 seconds per tick unless overridden. Simulation results are independent of that wall-clock interval.

| Seed | Found terrain water | Drank | Alive at tick 2,500 | Thirst deaths | Latest first drink | Median travel per active agent-day | Peak sampled RSS | Largest snapshot pair |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20260420 | 50/50 | 50/50 | 50/50 | 0 | tick 207 | 2,783 m | 361 MiB | 2.93 MiB |
| 20260421 | 50/50 | 50/50 | 50/50 | 0 | tick 213 | 2,771 m | 442 MiB | 2.82 MiB |
| 20260422 | 50/50 | 50/50 | 50/50 | 0 | tick 216 | 2,779 m | 466 MiB | 3.03 MiB |

All 150 agents drank well before the first fatal thirst point at about tick 1,080, and no agent died during the measured interval. Each seed logged more than 1,000 drink-action ticks, showing repeat access beyond the first drink. The earlier run had 42, 36, and 36 drinkers and 11, 17, and 18 thirst deaths for these same seeds. Nearly all active agent-days in the follow-up fall within the proposed 2–5 km travel range; an active day means at least 500 m travelled. The first-day average across all agents was 3.07–3.09 km. These results pass the first milestone 3 target of at least 80% drinking and fewer than 20% thirst deaths **in each seed**. They do not prove indefinite survival or remove the need for the later reproduction milestone.

The failure diagnosis found that 36 of the earlier 46 thirst deaths never discovered a shoreline. Sampled routes were often 100–400 m from the nearest water while random exploration moved farther away. Rest selection compounded the problem: tiredness could outrank near-fatal thirst, leaving an agent resting before a thirst death. The follow-up gives a thirsty agent with no remembered shore a coarse, local waterward heading from deterministic terrain samples up to 640 m away. This is a navigation hint, not a counted sighting or a new water object; the agent still reaches and perceives a drinkable bank. The sample cache is bounded and regenerates from the world seed, so snapshots need no new state. Fatal hunger and thirst now take precedence over nonfatal tiredness, ordered by time to the lethal threshold.

CPU and RSS are offline estimates, not Railway telemetry. The tick p95 was 176–192 ms on this cloud machine, far below the production 20-second interval. The three seeds run sequentially in one process, so later RSS peaks can include memory retained from earlier worlds. An [isolated seed-22 run](survival-m3-water-guide-isolated.json), made with `npm run baseline -- --seeds 20260422 --output /tmp/survival-water-guide-isolated.json`, reached 365 MiB sampled RSS rather than 466 MiB while reproducing 50 drinkers, zero deaths, and 50 survivors. Snapshot pairs include the primary and last-known-good backup. A 512 MiB instance has some measured headroom for this 2,500-tick world, but keep monitoring memory and snapshot growth on the single production instance, especially before adding population growth or object lifecycles.

The guide samples water on a 32 m grid and can miss narrow or distant sources beyond 640 m. Agents fall back to exploration when it finds no hint. This is a bounded first survival model, not a detailed model of how a real bird senses a watershed. The fixed-seed benchmark is a regression reference; later changes should add more seeds and longer runs rather than assuming every population will survive indefinitely.
