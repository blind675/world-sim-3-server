# Survival baseline, version 1

This report measures the current survival loop before milestone 3 changes it. The checked-in [JSON report](survival-v1.json) comes from:

```bash
npm run baseline -- --output docs/baselines/survival-v1.json
```

The runner starts a fresh world for each of the fixed seeds 20260420, 20260421, and 20260422, with the default 5,120 × 5,120 world, 50 agents, and survival settings recorded in the report. It advances up to 2,500 ticks, stopping early if all agents die. At the default 10-second live interval, 2,500 ticks represent about 6 hours 56 minutes of simulated live time, but the offline runner advances them as quickly as the CPU allows. It uses no HTTP requests or real-time timer. It writes snapshots only to a temporary directory and removes them when each run ends. Run it from a development shell; `NODE_ENV=production` intentionally rejects starting a world without its volume.

## Metric meanings

- `discoveredAgents` counts agents whose memory held a `water_source` at least once. This measures discovery of the **current generated water markers**, not discovery of drinkable terrain water. `drankAgents` counts agents whose thirst fell during a tick, indicating a successful drink action.
- Travel is the sum of shortest wrapped coordinate changes in cells. `movingAgentTicks` counts ticks with a position change. Idle and waiting count the state **after** each tick, so these are diagnostic state samples rather than exact action durations. Per-agent records make stuck and short-lived agents visible.
- `lifespanTicks.medianOfDead` excludes survivors; per-agent `lifetimeTicks` is null for an agent still alive at the end. Death causes are collected after every tick because the live death store retains only the latest 1,000 records.
- CPU time is process user plus system time during the tick loop. Wall time includes measurement and checkpoint writes. Tick p50/p95 measure the simulation call itself. RSS is sampled every ten ticks and at checkpoints. These measurements vary by machine and, because seeds run sequentially in one process, later RSS values can include memory retained from prior runs. They are capacity estimates, not pass/fail thresholds.
- Snapshot sizes are measured from the real serialized snapshot writer at tick 0, every 500 ticks, and the final tick. The backup column shows the extra bytes retained for recovery. Terrain and static objects are regenerated and do not occupy snapshot space. These are temporary files; a production deployment still needs its persistent volume.

## Results and use

| Seed | Saw water | Drank | Alive at tick 2,500 | Thirst deaths | Total travel | Peak sampled RSS | Largest primary snapshot |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20260420 | 12/50 | 8/50 | 8/50 | 42 | 50,769 cells | 254 MiB | 699 KiB |
| 20260421 | 13/50 | 9/50 | 9/50 | 41 | 51,013 cells | 272 MiB | 789 KiB |
| 20260422 | 17/50 | 13/50 | 13/50 | 37 | 51,951 cells | 287 MiB | 741 KiB |

All recorded deaths were from thirst, at tick 2,001. Every survivor had drunk. Only 42 of the 150 agents ever held a water-source memory, and 30 drank successfully. This makes water discovery and reaching a usable source the first survival problem to investigate. The runner does not yet distinguish agents that saw water but failed to path to it from those that lost the memory or arrived too late; milestone 3 should instrument those cases when changing the behavior.

The largest primary snapshots were about 0.7–0.8 MiB before the deaths. At tick 2,500 the smaller current snapshot coexists with a larger pre-death backup; the largest observed current-plus-backup pair was about 0.92 MiB. The three runs used roughly 46–53 seconds of wall time each in this cloud environment, with tick p95 of 75–83 ms. Those timing and RSS figures are capacity estimates for this offline process, not a measurement of the deployed Railway instance or a strict CI threshold.

The [JSON report](survival-v1.json) is the quantitative reference. For milestone 3, compare the same seeds and settings. A useful first target is that at least 80% of agents in **each seed** drink before critical thirst and that thirst deaths by tick 2,500 fall below 20%; individual mortality remains expected. A performance regression should be investigated on comparable hardware; exact wall or RSS numbers are not deterministic. Keep the report format versioned if metric definitions change. A new run should include the complete command and relevant code revision in its documentation.

No viewer changes are involved in this milestone. The offline runner does not validate live Railway resource usage, network traffic under viewer load, or mobile rendering performance.
