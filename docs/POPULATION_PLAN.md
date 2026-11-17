# Population and interaction plan

**Status:** Milestone 8 complete on `staging`; milestones 9–11 remain planned. The [roadmap](SIMULATION_ROADMAP.md) is the progress tracker. This plan replaces the old combined milestone 8 without changing the completed milestones 1–7.

## Why this order

The current world has a fixed initial group and no births. Adding age-based death before reproduction could remove the last agents from the always-on world. Age and life stages come first as observable data; reproduction comes next under a hard cap; natural lifespan mortality and long-run balance follow once newborns can replace older agents. Inventory is a separate action and persistence problem, so it comes after the population loop.

## 8. Agent templates and life stages

Define a checked-in, validated agent template for the existing fictional ground bird. Separate identity and species, inherited trait bounds, and current condition. The template should describe age-stage thresholds and a prospective lifespan range. Existing agents gain a birth tick consistent with their current world age when restoring an older snapshot; their positions, needs, paths, memories, behavior, and IDs remain intact. Derive displayed age from the saved simulation tick, not wall time. Keep current hunger and thirst death rules; **do not activate age-related death yet**. Expose template and stage through additive read-only API fields, then show them in web and mobile details.

**Completion check:** Validate and pin the template in snapshots, reject incompatible edits clearly, test migration from the current deployed snapshot shape, and replay across a day boundary. Confirm the current survival and walking baseline does not regress materially and measure the extra snapshot bytes. A public viewer cannot edit live templates.

## 9. Reproduction and inheritance

Use two nearby, eligible adult agents, initially using the existing sex field. Eligibility needs a minimum age, acceptable hunger/thirst, a cooldown, and an available walkable birth cell. A birth consumes a bounded resource budget and cannot exceed a hard population cap. Inherit numeric traits within template bounds with a small trait-specific mutation; the newborn starts with empty memory, path, and inventory. Parent IDs and a monotonic birth ID counter belong to durable state. Avoid a broad genetic algorithm or relationship system in this first pass.

**Completion check:** Tests cover blocked births, successful births, trait bounds, cap enforcement, same-seed determinism, and identical birth outcomes after snapshot restore. Run a multi-seed offline benchmark for births, resource use, tick cost, and snapshot growth. Keep age-related death disabled until milestone 10.

## 10. Lifespan and population balance

Turn on age-related mortality and record it separately from hunger and thirst. Tune age, birth eligibility, costs, and resource availability together so population remains bounded and has a measured chance of persisting. Measure multiple seeds over many simulated days, including birth and death rates, extinction, the distribution of ages and traits, travel, memory use, tick time, and snapshot size. Do not promise immortal agents or guaranteed non-extinction; document the observed survival horizon and any unstable seeds.

**Completion check:** No population cap breach or ID collision; death records and population counts survive restart; replay remains deterministic. Compare against the fixed-seed survival baseline and check a single 512 MiB instance has room before release.

## 11. First inventory interaction

Choose one concrete use case: take one fruit from a food source, carry it, and eat it later. The source stock changes once when picked up, the carried item belongs to the agent snapshot, and eating it satisfies hunger without consuming the source again. Keep capacity at one item initially; decide spoilage and dropping rules when implementing this milestone. Show the carried item and action in read-only web/mobile details. Defer generic item stacks, crafting, construction, and social mechanics.

**Completion check:** Verify stock accounting, contention between agents, inventory capacity, carrying across movement, hunger restoration, and snapshot replay. Measure whether carrying food changes survival or resource pressure before generalizing inventory.

## Shared release rules

Each milestone lands on `staging` first. Preserve the live world with a tested migration when adding snapshot or catalogue fields; never silently create a new world on incompatibility. Keep the backend authoritative and both public viewers read-only. Compare offline survival and capacity with the preceding milestone. Release to `main` only on an explicit request, backend before dependent viewers, with a backup of the persistent Railway snapshot volume.
