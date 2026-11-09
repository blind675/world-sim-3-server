# Simulation design — discussion draft

**Status:** Working proposal, not an implementation specification. This captures the November 2026 ideas and separates agreed direction from open decisions. The historical [PRD](PRODUCT_REQUIREMENTS.md) and [build checklist](BUILD_CHECKLIST.md) describe the original plan; current behavior is defined by code and tests.

## Direction

Build a world that remains interesting to watch over many simulated days: agents have understandable motives, adapt to conditions, and can die, while reproduction can sustain a population. Prefer a few rules that create observable consequences over many independent features. The backend remains authoritative and deterministic where practical; the web and mobile apps remain viewers. Keep the single-instance, file-snapshot deployment affordable.

Agreed in discussion:

- Individual agents remain mortal. Reproduction, rather than immortality or automatic respawning, is the intended long-term population mechanism.
- Diurnal agents tend to sleep at night; nocturnal agents tend to sleep during the day.

## Current baseline to preserve or deliberately replace

- `hunger`, `thirst`, and `tiredness` are **deficits** in `[0, 1]`: zero is satisfied; one causes immediate death. They rise every tick at a fixed base rate. The most urgent deficit over its threshold selects a resource-seeking goal.
- Drinking requires a generated `water_source` object; resting requires a `rest_spot` object. Eating uses a food object with stock and regrowth. Actions such as eating, drinking, and resting currently span multiple ticks.
- One generic agent archetype spawns deterministically from the configured world seed. Agents have a small fixed trait set, memory, paths, and inventory fields, but no birth or aging loop.
- Memory stores observed entities and clusters with confidence decay and a capacity limit. Water sources, food, trees, and rocks can form clusters; capacity eviction currently favors confidence alone.
- Terrain is deterministic, wrapped, and generated on demand. Snapshots persist mutable state and pin the object catalogue. Changes to behavior definitions or agent templates will need the same compatibility discipline.
- The object catalogue already has categories, colors, sprites, relative variety weights, preferred ground types, and optional elevation ranges. These preferences choose a variety at positions created by a fixed spawn strategy; they do not yet change the number of objects or define a new placement algorithm. There are no object ages or per-instance lifespans.

## Vocabulary and decision flow

Use distinct concepts so editor data does not become a second simulation engine:

| Concept | Proposed meaning | Example |
| --- | --- | --- |
| Need | A measurable physiological deficit, zero good and one critical | thirst = 0.7 |
| Goal | An outcome an agent is trying to achieve | reach drinkable water |
| Behavior | A resumable policy that chooses and sequences work | seek water, look around |
| Action | One tick of physical activity or waiting | move one cell, turn, rest |
| State | The current observable result of behavior and action | moving, drinking, sleeping |

The proposed one-tick action set is stay, rest, turn left or right 90 degrees, move to the next path cell, and one tick of eating or drinking. `Find path` is initially a planning operation inside a behavior, not a physical action. We can charge one tick for planning later if its time cost matters to the simulation. A multi-tick activity such as sleeping is repeated one-tick rest actions with interrupt rules. A behavior must be resumable across ticks and snapshots, and urgent needs must be able to interrupt leisure behavior.

Do not average the three needs to decide whether an agent is safe: an average can conceal critical thirst. For leisure behavior eligibility, a simple **comfort** score is `1 - max(hunger, thirst, tiredness)`. The individual deficits still choose which survival goal wins. We can consider weights after observing baseline runs, not before.

## Behavior catalogue proposal

Start with versioned JSON definitions stored in the backend repository, validated at startup and pinned by snapshots. Keep the vocabulary deliberately small: eligible when, action, sequence, bounded repeat, conditional branch, and weighted choice. `maybe` can be a weighted choice using a saved random-generator state. No arbitrary JavaScript or unbounded loops in definitions.

Each definition needs an ID, version, display name, eligibility rules, relative weight or priority, cooldown, interrupt policy, and a bounded sequence or algorithm name. It also needs a maximum tick budget and an explicit fallback if planning fails. The scheduler first handles survival and safety; only eligible leisure behaviors are selected by weight. This prevents an attractive idle probability from overruling life-threatening thirst. Hysteresis or a minimum commitment time should stop rapid goal switching.

Candidate first behaviors:

- **Idle:** stay in place for roughly 10 ticks when comfortable. Leave early for urgent needs or danger.
- **Look around:** pause, rotate, and scan in several directions for roughly 20 ticks. Decide whether a turn consumes a tick and specify the exact sequence before implementation.
- **Wander/explore:** choose a reachable destination using an exploration policy, then move along a path. This is different from a single-tick move action.
- **Seek food / water / sleep:** interruptible survival policies driven by each corresponding deficit, with retry and fallback rules when a memory is stale or a route fails.

A browser editor may eventually inspect definitions and export validated drafts, following the object-catalogue editor. Publishing a changed behavior set should be a reviewed backend deployment or deliberate world reset/migration. A live editor that changes rules mid-tick is out of scope for the first iteration.

## Survival, resources, and exploration

**Water:** Replace generated drinking markers with drinkability derived from terrain. The agent should path to a walkable shoreline cell adjacent to drinkable water, not into impassable deep water. A memory entry can represent a stable shoreline location or region with coordinates, last-seen tick, and confidence; there is no need to memorize every water tile. Start by defining which water tiles are drinkable and verifying that all initial groups have a reachable source within a reasonable journey.

**Sleep:** Remove required rest-spot objects. An agent may rest where it stands, with perception suspended during sleep. Terrain, temperature, or nearby threats could later make some locations safer or more comfortable. A remembered home or preferred sleeping area can influence travel without becoming a hard requirement.

**Movement cost:** Keep baseline needs decay and add a small, measurable activity cost for walking, terrain difficulty, and eventually cold. Calibrate against food/water travel times before changing mortality. If a critical deficit immediately kills agents even after they begin seeking relief, consider a short critical grace period instead of simply making every agent's metabolism slower.

**Finding water:** Instrument failures first. Candidate remedies are spawning groups within a reachable catchment, remembering shoreline regions, and biased exploration toward lower elevations or unexplored nearby terrain. Random long-distance wandering is unlikely to solve this reliably. The world is 5120 cells wide and wraps: a proposed 5000-cell home radius covers almost the entire world, so choose a much smaller radius in measured travel-time terms if locality is desired.

**Memory:** Keep *confidence* (is the information still accurate?) separate from *importance* (is it useful to retain?). Terrain water is stable and can decay slowly; food availability changes, so a high-value food memory can still become stale. At capacity, retain entries by a bounded utility score informed by relevance, confidence, distance, and recency. Deduplicate nearby water or food memories so one resource patch does not fill the whole memory.

## Object variety, habitats, and lifecycles

Add varieties only when they give the viewer a clearer habitat or give agents a meaningful choice. Candidates include mushrooms or nuts as distinct food, reeds and shrubs near water, and fallen wood in forests. Start by using the existing five behavior/spawn strategies for visual varieties; a new resource yield or interaction requires backend behavior, not only a JSON entry. Distinguish **category** (food, material, etc.), **behavior** (what an agent can do with it), and **habitat** (where it can appear).

Preferred ground type and elevation are already available. A later habitat model could add distance to water, shade, temperature, and minimum spacing, together with a local density or carrying-capacity rule. These factors should affect deterministic candidate placement, not just the appearance selected after placement. Define constraints and fallbacks so a narrowly specified variety does not silently disappear from most worlds.

Lifespan belongs to an **instance**, not merely its catalogue definition. Keep living source and consumable product separate: a berry bush may live for years and regrow stock while picked berries rot quickly. Trees may age, die, and become fallen wood; rocks should generally remain static unless geological change adds useful behavior. Evaporation is better modeled as a water/temperature rule than as the expiry of thousands of water objects. Rest spots are planned for removal, so they need no lifecycle.

Because terrain and static objects are generated lazily, a lifecycle must not depend on whether a viewer opened a chunk. A first design can use deterministic birth ticks plus sparse persisted overrides or scheduled events for changed instances. Avoid scanning the entire 5120 × 5120 world every tick. Record enough state and random-generator progress in snapshots for the same object to have the same fate after restart. Pin any new catalogue fields to the snapshot and plan migration or a deliberate new-world reset before changing a deployed catalogue.

## Time, light, and temperature

Derive time of day from `tickCount` and a configured ticks-per-day value. Light level can reduce effective vision range at night. A diurnal/nocturnal trait changes preferred active and sleep periods, but urgent thirst or danger can interrupt sleep. Temperature can combine a day/night curve with terrain or elevation later. Introduce one measured effect at a time, such as extra energy expenditure in cold, so we can tell why survival changes. Weather is a separate future layer, not a prerequisite for a day/night cycle.

## Agent templates and inheritance

Start with a versioned agent template JSON for archetype defaults and safe trait ranges. An agent's **identity** (ID and optional name), **inherited traits**, and **current condition** (needs, age, injury, memories) are different data. Candidate inheritable traits include vision range, memory capacity/decay, metabolic and movement-cost multipliers, body size, circadian preference, and lifespan. Height/body size may trade vision against energy cost, but should not be added without a visible effect to evaluate.

For two-parent reproduction, a first model can blend bounded numeric traits and apply a small trait-specific mutation chance. `±1` is not suitable for every field: a one-cell vision change differs from a one-unit metabolism change. Walking speed needs particular care because movement currently advances in tick-sized steps and the viewers interpolate those steps. Lifespan may vary around a template by about 10%. Births need age and energy eligibility, a population cap, and a resource cost, or the population can grow without ecological limits. This is inheritance with possible selection over generations; it need not be described as a full genetic algorithm until there is a defined fitness/selection mechanism.

Inventory and world interaction should follow stable resource and action rules. Start with one concrete use case (for example, carrying one food item) before defining generic item stacks, crafting, or construction.

## Proposed order and evidence

1. **Measure the current survival loop.** Pick a simulated day length, run several fixed seeds for many ticks, and record lifespan, death causes, water discovery, travel distance, idle time, and snapshot size. This gives a baseline for every later change.
2. **Make basic survival credible.** Terrain-based water, rest anywhere, reachable-resource checks, and memory retention. Keep existing viewer APIs compatible or plan their transition explicitly.
3. **Expand object variety and prove one lifecycle.** Add a few habitat-specific varieties with existing strategies, then prototype one perishable or aging resource. Measure density, update cost, and snapshot growth before generalizing.
4. **Introduce a small behavior scheduler.** Define one-tick action semantics, interrupt/resume state, bounded JSON definitions, and the first idle/look-around/explore behaviors. Verify deterministic replay after snapshot restore.
5. **Add day/night, then temperature.** Calibrate each effect separately against the survival baseline.
6. **Add agent templates, aging, and reproduction.** Validate inheritance, mutation bounds, and population stability across multiple seeds. Add the editor after the template and behavior formats settle.
7. **Add one inventory interaction.** Expand only after it produces a useful observable decision.

Acceptance should be behavioral, not just structural: agents can reliably locate reachable water, rest without a marker, show interpretable choices in the viewer, and continue the same behavior after a restart. For mortal populations, measure extinction and birth rates over many seeds and simulated days rather than requiring that no individual ever dies. Watch CPU, memory, and snapshot growth on the single cloud instance.

## Open decisions for the next discussion

1. How long is a simulated day in ticks, and how much real time should one simulated day take at the deployed tick interval?
2. Should all existing water be drinkable, or should drinking distinguish fresh water from other water later?
3. How far should an agent's preferred home range be, measured in *travel time* rather than raw cells?
4. Should behavior definitions describe only simple sequences while complex seeking remains named backend algorithms, or should the data format eventually express both?
5. What survival target should we use for the first balancing pass: median lifespan, percentage reaching water, or population survival over a chosen number of days?
6. When a new catalogue or template changes snapshot compatibility, should the default workflow be an explicit fresh-world reset or a migration preserving the current population?
7. Should the first object lifecycle model a consumable that rots, a food plant that ages, or a tree that dies and becomes fallen wood?
