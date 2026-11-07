# Life Simulation v3 — Product Requirements Document (PRD)

> Historical product plan imported from the original workspace. It describes
> intended behavior, not a guarantee that every feature is implemented. For
> current commands and API behavior, consult the repository README and code.

**Version:** 3.0

**Status:** Draft for implementation kickoff

**Project codename:** Life Simulation v3

**Date:** April 20, 2026

> **Implementation status (Nov 2026):** The backend runs wrapped terrain, autonomous agents, perception, memory, survival needs, and resource actions. The frontend provides a canvas viewer and inspection panels. Terrain chunks are generated on demand, cached within a fixed limit, and static object placement is seeded. Death causes are recorded, but death coordinates, map markers, and a `/api/deaths` endpoint remain to be built. Agent pathfinding avoids occupied cells; repulsion movement remains future work. The checklist below records the remaining gaps.

---

## 1. Executive Summary

Life Simulation v3 is a restart of the project with a new primary objective:

**simulate life first, not the entire planet first.**

The purpose of v3 is to build a visually inspectable 2D life simulation in which agents move through a grid-based world, perceive their surroundings, remember what they have seen, satisfy core survival needs, and eventually reproduce, communicate, and evolve.

This version intentionally avoids the earlier world-first direction focused on climate, hydrology, planetary-scale terrain, and large-scale environmental simulation. Instead, it prioritizes:

- a visible UI as early as possible,
- a clean client-server architecture,
- a believable but simplified terrain model,
- inspectable agent behavior,
- a fast path to observing emergent behavior.

The system will use:

- a **Node.js + Express backend (JavaScript)** for world state, simulation, and APIs,
- a **Next.js frontend (TypeScript + Tailwind CSS)** for visualization and inspection.

---

## 2. Product Vision

Create a simulation sandbox where autonomous agents:

- move through a 2D wrapped world,
- observe terrain, resources, items, and other agents,
- store imperfect knowledge in memory,
- act based on needs such as hunger, thirst, and tiredness,
- interact with the environment and with each other,
- eventually reproduce and pass traits to offspring.

The product should make agent behavior understandable and debuggable from the beginning.

---

## 3. Core Product Principles

### 3.1 Agent-first
The primary simulation subject is **agents**, not the planet.

### 3.2 UI-first
A working visualizer must exist as early as possible so behavior can be observed rather than guessed.

### 3.3 Deterministic where practical
Given the same seed and configuration, world generation should be reproducible. Agent simulation should also be reproducible when using the same seed and same event ordering.

### 3.4 Simple world, rich behavior
The world should initially be simple enough to support fast implementation, while agent perception, memory, movement, and decision-making should receive priority.

### 3.5 Expandable architecture
The architecture must support future additions such as more agent types, resource systems, evolution, and separate clients.

---

## 4. Goals

### 4.1 Primary goals
1. Build a working client-server simulation platform.
2. Render a navigable and inspectable 2D world in the UI as early as possible.
3. Support a wrapped world with seamless terrain generation.
4. Implement a first agent capable of movement, perception, memory, and basic need satisfaction.
5. Make all important simulation state inspectable from the frontend.

### 4.2 Secondary goals
1. Support sparse world objects such as trees, rocks, food, items, and water zones.
2. Support multiple agents in the same world.
3. Support future reproduction and trait inheritance.
4. Support future mobile clients through a shared API contract.

---

## 5. Non-Goals for v3 initial scope

The following are explicitly **out of scope** for the initial implementation:

- climate simulation,
- atmospheric systems,
- hydrology simulation,
- biome generation,
- global weather,
- realistic ecology with many trophic layers,
- multiplayer control,
- real-time combat systems,
- full crafting trees,
- detailed genetics/evolution in the first milestone,
- distributed simulation,
- complex persistence architecture.

These may be added later only after core agent behavior is working and visible.

---

## 6. Target Users

Primary users are:

- the project team building and tuning the simulation,
- designers observing emergent behavior,
- developers debugging world and agent systems.

The first usable product is a **debuggable simulation tool**, not a consumer-facing game.

---

## 7. High-Level Scope

v3 initial scope includes:

- generation of a wrapped 2D terrain map,
- rendering of terrain on a frontend canvas,
- backend ownership of simulation state,
- viewport-based world querying,
- rendering of entities and objects,
- one initial agent archetype,
- basic movement and A* pathfinding,
- cone-based vision,
- memory system with confidence decay,
- survival-driven decisions.

---

## 8. Architecture Overview

## 8.1 Overall architecture
The system will follow a **client-server architecture**.

### Backend responsibilities
The backend is authoritative and responsible for:

- world generation,
- simulation tick loop,
- terrain queries,
- entity state,
- resource/object state,
- agent logic,
- viewport APIs,
- live update streams,
- deterministic seeding.

### Frontend responsibilities
The frontend is responsible for:

- world rendering,
- camera controls,
- layer toggles,
- hover inspection,
- selection of agents and objects,
- debug panels,
- consuming REST and WebSocket data.

---

## 8.2 Technology stack

### Backend
- Node.js
- Express
- JavaScript

### Frontend
- Next.js
- TypeScript
- Tailwind CSS

### Communication
- REST for world metadata and viewport fetches
- WebSocket for live simulation updates and selected-agent refreshes

---

## 9. World Model

## 9.1 World topology
The world is a **2D wrapped world**.

This means:
- moving beyond the right edge wraps to the left,
- moving beyond the bottom edge wraps to the top,
- terrain generation must wrap seamlessly.

This provides continuity and removes world borders.

---

## 9.2 World scale

### Cell size
- **1 meter x 1 meter** per cell.

### Recommended initial world size
- **5120 x 5120 cells**.

This yields a world of approximately:
- **5.12 km x 5.12 km**.

### Rationale
This is large enough to:
- support exploration,
- create distance between resource clusters,
- support multiple agents,
- allow future territory formation,
- still remain manageable for a first implementation.

---

## 9.3 Terrain generation

### Requirement
Terrain must be generated using **wrapped/circular Perlin noise** so that the world wraps seamlessly.

### Terrain intent
Because the world is only about 5 km wide, terrain should be **low-relief**, not continent-scale.

### Initial height profile
Recommended target range:
- minimum: around **-10 m**
- maximum: around **80 m**

Acceptable alternative range for a slightly rougher map:
- **-10 m to 120 m**

### Design intent
Terrain should produce:
- gentle hills,
- shallow basins,
- local ridges,
- navigationally meaningful slopes,
- believable movement penalties,
- not large mountain systems.

---

## 9.4 Ground and terrain types
Each cell should support terrain-derived classification such as:

- ground
- tall grass
- mud
- shallow water
- deep water
- rock
- forest floor

Ground type may be derived from height, water depth, placement masks, or world generation rules.

---

## 9.5 Cell properties
Each world cell should support a minimal set of properties.

### Required cell fields
- `height`
- `groundType`
- `waterDepth` (optional at first, but supported by schema)
- `blocksVision`
- `baseMoveCost`

### Derived values
The following may be derived rather than stored permanently:
- slope
- final move penalty
- walkability
- visibility penalty

### Important note
Cell coordinates do not need to be stored inside each cell object. Coordinates are implied by array indices.

---

## 10. Spatial Organization

## 10.1 Why chunking exists in v3
Even though the terrain can be stored as a single global matrix, the simulation still requires spatial partitioning for:

- fast nearby entity queries,
- efficient rendering,
- efficient viewport fetches,
- localized updates,
- future save/load organization.

### Requirement
The system should conceptually support a single continuous world, but operationally use **chunks** as a spatial index.

---

## 10.2 Chunk size
Recommended initial chunk size:
- **128 x 128 cells**.

This produces:
- `5120 / 128 = 40` chunks per axis,
- `1600 total chunks`.

### Chunk responsibilities
Chunks should maintain:
- item IDs in chunk,
- object IDs in chunk,
- agent IDs in chunk,
- optional static object lists,
- optional dirty flags for rendering/update.

### Important note
Chunking is primarily for **indexing and queries**, not because the world is split into separate simulation instances.

---

## 11. Entities and Objects

## 11.1 Entity model
The world consists of:

- terrain cells,
- world objects,
- items,
- agents.

### World objects
Examples:
- trees
- rocks
- bushes
- water sources
- dens/rest spots

### Items
Examples:
- food
- wood
- stone
- simple tools
- dropped resources

### Agents
Autonomous simulated beings.

---

## 11.2 Initial data model categories

### Static or semi-static world objects
- Tree
- Rock
- Bush
- WaterSource
- RestSpot

### Dynamic items
- FoodItem
- WoodItem
- StoneItem
- ToolItem
- DroppedItem

### Dynamic agents
- ForagerAgent

---

## 12. Initial Agent Design

## 12.1 Initial agent archetype
The first agent type should be a **generic forager**.

This is intentionally chosen instead of a predator or full human because it exercises the most important systems with the least dependency complexity.

### Why this archetype
It supports testing of:
- movement,
- pathfinding,
- perception,
- memory,
- survival needs,
- resource consumption,
- exploration,
- reproduction later.

---

## 12.2 Required agent fields
Each agent should include at least:

- `id`
- `x`
- `y`
- `facing`
- `sex`
- `age`
- `state`
- `currentGoal`
- `currentAction`
- `targetId` or target coordinates
- `inventory`
- `hunger`
- `thirst`
- `tiredness`
- `visionRange`
- `memory`
- `traits` (placeholder structure from v0.1 onward)

---

## 12.3 Agent needs
The initial core needs are:
- hunger
- thirst
- tiredness

These should decay over time and drive decision-making.

### Initial expected behavior
An agent should:
- seek water when thirsty,
- seek food when hungry,
- seek a rest location when tired,
- wander or explore when stable.

---

## 12.4 Agent movement
Agents move on the world grid.

### Requirements
- movement is cell-based,
- movement must respect wrap,
- movement cost is affected by terrain,
- water depth may block movement,
- A* pathfinding must be supported.

### Pathfinding scope
The initial implementation can use local A*.
Hierarchical or multi-stage pathfinding is not required in the first milestone.

---

## 12.5 Agent perception
Agents must have a vision system.

### Initial vision model
- cone-shaped perception in front of the agent,
- limited range,
- based on facing direction,
- checks for visible agents, items, and objects,
- simple obstruction using `blocksVision`.

### Out of scope for first version
- complex partial occlusion,
- advanced ray-budget optimization,
- probabilistic sensor noise beyond simple visibility constraints.

---

## 12.6 Agent memory
Agents need an imperfect memory model.

### Required memory behavior
If an agent sees something, it should store:
- object type,
- approximate coordinates,
- timestamp or last seen tick,
- confidence / probability score.

### Memory decay
Confidence should decrease over time so old information becomes less reliable.

### Initial memory use
Agents should be able to:
- navigate toward remembered food or water,
- prefer fresher memories when selecting targets.

---

## 12.7 Communication
Communication is not required for the very first visible milestone, but the architecture should support it.

### Future behavior
Similar agents close enough to each other may exchange some memory entries.

---

## 12.8 Reproduction and traits
Reproduction is not required in Milestone 1, but trait storage should exist in agent schema.

### Future traits may include
- vision range
- memory size
- memory decay rate
- movement speed
- hunger decay rate
- thirst decay rate
- sociality
- agreeableness
- mating drive

---

## 13. Simulation Model

## 13.1 Simulation ownership
The backend is fully authoritative.

The frontend never owns simulation truth.

---

## 13.2 Tick loop
The simulation runs automatically on a server-side tick loop without manual start/stop controls.

### Implementation details
- **Auto-start**: Simulation begins automatically when the backend starts
- **Fixed tick interval**: Configurable via `tickMs` (default 200ms)
- **Deterministic ordering**: Agent updates follow consistent ordering
- **No manual controls**: No start/stop/pause endpoints - simulation runs continuously

### Current cadence
- one simulation step every **200ms** by default (`tickMs` configurable)
- all agents update every tick
- frontend fetches tick count at the same interval as simulation updates

---

## 13.3 Update order
A simple initial order:
1. process world timers/regrowth,
2. update agents,
3. resolve movements/interactions,
4. update memory/knowledge,
5. broadcast changed state.

---

## 14. API Requirements

## 14.1 REST endpoints

### `GET /api/world/meta`
Returns:
- width
- height
- cellSize
- seed
- wrap mode
- chunk size

### `GET /api/world/viewport`
Returns a rectangular subset of the world for rendering.

Supported layers should include:
- height
- groundType
- waterDepth

Parameters:
- `x`
- `y`
- `w`
- `h`
- `layers`
- optional `zoom` or `stride`

### `GET /api/entities/in-view`
Returns visible dynamic/static entities in the viewport:
- agents
- items
- objects

### `GET /api/agents/:id`
Returns a detailed agent view for inspection.

### `GET /api/simulation/status`
Returns current simulation tick count and timing information. The simulation runs automatically without manual start/stop controls.

---

## 14.2 WebSocket requirements
The backend should provide live updates for:
- changed agents,
- selection updates,
- tick number / simulation time,
- optional viewport refresh signals.

This can be added after the first REST-based visualizer is working.

---

## 15. Frontend Requirements

## 15.1 Rendering requirements
The frontend must render the world on a **canvas**.

### Why canvas
Canvas is preferred over DOM tiles because the map will be large and needs efficient panning and zooming.

### Tailwind usage
Tailwind should style:
- panels,
- controls,
- overlays,
- layout,
- debug UI.

Tailwind should not be used to render the terrain grid itself.

---

## 15.2 Initial viewer features
The UI must support:
- map rendering,
- pan,
- zoom,
- hover inspection,
- selected tile inspection,
- layer switching,
- agent selection,
- debug side panel.

---

## 15.3 Required UI panels

### Map canvas
Main world viewport.

### Debug sidebar
Displays:
- selected tile data,
- selected agent data,
- simulation status,
- current layer,
- optional tick count.

### Layer controls
Must support toggling between at least:
- height view,
- ground type view,
- water view when implemented,
- entity overlay.

### Tutorial system
Interactive onboarding for first-time users:
- 5-page fullscreen tutorial overlay,
- automatic first-visit detection,
- localStorage completion tracking,
- visual entity guide with symbols and colors,
- coverage of simulation overview, world, entities, agents, and mechanics,
- accessible via "Show Tutorial" button in sidebar.

---

## 16. Milestones

## 16.1 Milestone 0 — Project setup  ✅ **Complete**
### Objective
Set up backend/frontend foundation.

### Deliverables
- backend Express project bootstrapped,
- frontend Next.js + Tailwind + TypeScript project bootstrapped,
- shared API contract documented,
- seed/config structure created.

### Acceptance
- backend and frontend run locally,
- frontend can call backend successfully.

---

## 16.2 Milestone 1 — Terrain visualizer  ✅ **Complete**
### Objective
Visualize the world as soon as possible.

### Deliverables
- wrapped circular Perlin height generation *(implemented as 4D Perlin with integer cycle counts for seamless toroidal wrap)*,
- low-relief terrain mapping,
- world metadata endpoint (`GET /api/world/meta`),
- viewport endpoint (`GET /api/world/viewport`),
- frontend canvas heatmap,
- pan/zoom,
- hover inspect.

### Acceptance
- world wraps visually with no seams,
- frontend can navigate the map,
- tile height is inspectable,
- terrain feels like a 5 km local landscape rather than a continent.

### Additional scope shipped
- `POST /api/world/chunks` batch endpoint (up to 64 chunks per request),
- client-side chunk cache with camera-proximity prioritised batch fetch (32 chunks per HTTP call),
- chunk-based zoom bounds (min ~1/3 chunk visible, max ~10×8 chunks visible),
- toggleable red chunk grid overlay,
- layer switching between `height`, `groundType`, and `waterDepth`,
- click-to-select cell with white outline + dark halo,
- **experimental** vector chamfer overlay for octagonal cell edges using a marching-squares rule (`CHAMFER_FRAC = 0.33`, `CHAMFER_MIN_PPC = 4`) — parked on a UI branch for future polish.

---

## 16.3 Milestone 2 — Static world objects  ✅ **Complete**
### Objective
Add visible world content.

### Deliverables
- trees *(deterministic placement gated by a two-octave seamless forest density field; conifer glyph with trunk + triangular canopy)*,
- rocks *(outcrop density field from `|noise|` ridges; faceted-boulder glyph with highlight facet)*,
- food nodes *(berry patches gated by a dedicated berry density field; three-berry cluster glyph with leaf)*,
- water sources *(shoreline acceptance on `shallow_water` depth ≤ 1.2 m and `mud`; droplet glyph with ripple ring)*,
- rest spots *(dense forest interior only, `forestDensity >= 0.55`; nest glyph with twig ring + hollow + radial twig ticks)*,
- object rendering in viewport *(all five types drawn on the canvas overlay, with simple fallbacks when cells are tiny)*,
- object querying in view *(new `GET /api/entities/in-view?x&y&w&h&types=` route backed by a per-chunk spatial index; wrap-correct rect, viewport side capped at 2048, deterministic across requests)*.

### Additional scope shipped
- chunk index module with `itemIds`/`objectIds`/`agentIds` arrays and wrap-aware `chunksInRect` helper,
- lazy per-chunk object generation with a sub-seeded PRNG (`splitmix32(hash(seed, cx, cy))`) so nothing is persisted,
- seamless 4D-Perlin density fields wrapped via 2D→4D circle mapping for forest, outcrop, and berry masks,
- frontend auto-fetch of objects for the visible chunk rect (abortable on camera change),
- screen-space hit-testing (10 px threshold) with objects taking priority over cell selection,
- sidebar additions: master Objects toggle, legend with the five glyphs, and Hover/Selected Object panels,
- HUD object count in the bottom-left corner.

### Acceptance
- objects appear in expected terrain zones (forests, outcrops, shorelines, berry patches, forest interior),
- viewport shows both terrain and entities,
- queries do not require a full-world scan.

---

## 16.4 Milestone 3 - First moving agent  **Complete**
### Objective
Add a visible, inspectable, autonomous agent with smooth movement animation.

### Deliverables
- one forager agent archetype,
- movement,
- A* pathfinding,
- visible facing,
- selected agent panel,
- current action display,
- **smooth interpolated movement animation**.

### Acceptance
- agent can move around the map,
- agent state is visible in UI,
- agent path can be debugged,
- **agent movement is smoothly animated between path points**.

### Implementation details
- **Frontend Animation**: Continuous 60fps rendering loop using `requestAnimationFrame`
- **Interpolation Logic**: Real-time position interpolation between movement start and target positions
- **Timing Synchronization**: Animation duration matches simulation tick interval (`tickMs / moveSpeed`)
- **Backend Movement Data**: Two-phase movement system - start position recorded, position updated on completion
- **Position Tracking**: Movement start times tracked per agent to prevent animation conflicts
- **State Management**: Proper cleanup of movement data when steps complete

### Technical fixes implemented
- **Removed simulation control endpoints**: Eliminated `/api/simulation/start`, `/api/simulation/stop`, `/api/simulation/tick` - simulation now auto-starts
- **Optimized API polling**: Replaced adaptive polling with tick count fetching at SIM_TICK_MS interval (typically 200ms)
- **Fixed React rendering error**: Corrected `currentGoal` type definition from `string | null` to object structure
- **Fixed agent idle behavior**: Increased goal-setting probability from 10% to 30% and cleared goals on path completion
- **Fixed animation timing**: Synchronized animation duration with simulation tick interval to prevent rapid snapping/repeating

---

## 16.5 Milestone 4 - Perception and memory **Complete**
### Objective
Make the agent meaningfully aware.

### Deliverables
- cone-based vision,
- detection of food/water/objects/agents,
- memory entries with confidence decay,
- target selection using memory.

### Acceptance
- agent can find known resources,
- old memories become less trusted,
- perception and memory can be inspected in the UI.

### Implementation details
- **Perception engine** (`backend/src/world/perception.js`):
  - Vision modeled as a 100° front cone plus a 4-cell omnidirectional near-field radius
  - Line-of-sight computed with Bresenham's line algorithm respecting `blocksVision` cells and opaque objects (trees, rocks)
  - Wrap-aware calculations using shortest delta and per-cell coordinate wrapping
  - Debug endpoint `GET /api/agents/:id/perception` for validation
- **Memory system** (`backend/src/world/memory.js`):
  - Per-agent memory array with entries: `{id, type, x, y, firstSeenTick, lastSeenTick, confidence}`
  - Visible entries refresh to confidence=1; others decay by `1 - traits.memoryDecayRate` (1% per tick)
  - Entries below `perception.memoryDecayFloor` (0.02) are evicted
  - Capacity enforcement (50 entries) drops lowest-confidence entries first
- **Simulation integration** (`backend/src/world/simulation.js`):
  - Perception and memory run first each tick before movement decisions
  - Idle agents bias 60% of new goals toward highest-confidence remembered food/water
  - Goals carry `memoryId` and `memoryConfidence` for UI provenance
- **Frontend visualization**:
  - Vision overlay: semi-transparent yellow cone slice with dashed near-field ring
  - Memory dots: confidence-colored (yellow to amber) points for each memory entry
  - Smooth cone rotation using interpolated agent position
  - Vision toggle in Overlays section (accent-yellow-400)
  - Memory panel showing entry count, type chips, top-5 confidence bars, and ticks-since-seen
  - Goal provenance: yellow "mem N%" badge when goals are sourced from memory
- **Configuration**:
  - Perception sub-config in `worldConfig.js` with env var overrides
  - `VISION_CONE_DEG` (100°), `VISION_NEAR_RADIUS` (4), `MEMORY_DECAY_FLOOR` (0.02)
  - Perception config published via `/api/world/meta` for frontend consumption

### Additional scope shipped
- Updated agent goal types to include `seek_food` and `seek_water` with memory metadata
- Enhanced sidebar to display memory statistics and confidence decay bars
- Real-time memory-driven behavior visible in simulation (agents path toward remembered resources)

---

## 16.6 Milestone 5 — Survival loop
### Objective
Create basic life behavior and user onboarding.

### Deliverables
- hunger, thirst, tiredness,
- simple utility-based or priority-based decisions,
- eating,
- drinking,
- resting,
- wandering/exploring,
- interactive tutorial system for first-time users.

### Acceptance
- agent behavior is visibly driven by needs,
- agent survives longer with access to resources than without them,
- tutorial automatically appears for first-time visitors,
- tutorial covers simulation concepts, world, entities, agents, and mechanics,
- users can reopen tutorial anytime via sidebar button.

### Implementation details
- **TutorialModal component** (`frontend/src/components/TutorialModal.tsx`):
  - 5-page interactive tutorial with fullscreen overlay
  - Progress indicator and navigation controls
  - Entity symbols (🌲🪨🍎💧⛺🤖) with matching colors
  - Visual examples of terrain types, need bars, vision cone, and pathfinding
  - First-visit detection using localStorage
  - Skip option on first page, "Start Exploring" on final page
- **Integration** (`frontend/src/app/page.tsx`):
  - Automatic tutorial display for new users
  - "Show Tutorial" button in sidebar for revisiting
  - localStorage completion tracking
- **Tutorial content**:
  1. Welcome to FlatWorld - simulation overview
  2. The World - terrain types and features
  3. World Entities - visual guide to all entities
  4. Agents & Their Needs - survival mechanics
  5. Perception & Memory - vision system and memory

---

## 16.6 Milestone 6 — Multiple agents
### Objective
Observe basic multi-agent presence and simple interactions.

### Deliverables
- multiple agents in the world,
- chunk-based spatial querying,
- efficient nearby entity lookup,
- basic agent-to-agent awareness,
- simple collision avoidance between agents.

### Acceptance
- the system supports multiple simultaneous agents,
- frontend remains usable with higher agent counts,
- nearby queries do not require global scans,
- agents can detect and avoid other agents.

---

## 16.7 Milestone 7 — Memory sharing and communication
### Objective
Enable agents to exchange information and coordinate through simple communication.

### Deliverables
- memory sharing between nearby agents,
- simple communication protocols,
- information propagation through agent networks,
- trust/reputation systems for shared information,
- visual indicators for communication events.

### Acceptance
- agents can exchange memory entries with nearby agents,
- shared information propagates through agent populations,
- communication has range and reliability constraints,
- UI shows when agents are sharing information,
- emergent information networks form organically.

---

## 17. Functional Requirements Summary

## 17.1 World
- must wrap seamlessly,
- must support 1m cells,
- must support low-relief wrapped terrain generation,
- must support cell-level movement properties.

## 17.2 Simulation
- backend-authoritative,
- fixed tick loop,
- support agent movement,
- support perception and memory,
- support need-driven actions.

## 17.3 Frontend
- must render terrain,
- must render entities,
- must support inspection,
- must support debug-oriented interaction.

---

## 18. Data Model Guidance

## 18.1 Cell model
Recommended minimal shape:

```js
{
  height: 0,
  groundType: 'ground',
  waterDepth: 0,
  blocksVision: false,
  baseMoveCost: 1
}
```

## 18.2 Agent model
Recommended minimal shape:

```js
{
  id: 'agent-1',
  x: 0,
  y: 0,
  facing: 0,
  sex: 'female',
  age: 0,
  state: 'idle',
  currentGoal: null,
  currentAction: null,
  hunger: 0,
  thirst: 0,
  tiredness: 0,
  inventory: [],
  memory: [],
  traits: {
    visionRange: 20,
    memoryCapacity: 50,
    memoryDecayRate: 0.01,
    moveSpeed: 1
  }
}
```

## 18.3 Chunk index model
Recommended minimal shape:

```js
{
  key: '10,12',
  itemIds: [],
  objectIds: [],
  agentIds: []
}
```

---

## 19. Performance Guidance

### Initial rules
- do not scan all entities globally for local queries,
- do not render the full world at once,
- use viewport APIs,
- use chunk-based entity indexing,
- derive slope locally instead of storing a heavy global slope field unless profiling proves otherwise.

### Not required in first milestone
- advanced binary protocols,
- worker-based simulation,
- highly optimized pathfinding heuristics,
- GPU rendering.

---

## 20. Acceptance Criteria

The initial project is successful when:

1. the backend and frontend run as separate apps,
2. the frontend can request and render a world viewport,
3. the terrain wraps seamlessly,
4. the world visually resembles a local 5 km landscape,
5. static objects can be shown on the map,
6. at least one agent can be selected and inspected,
7. at least one agent can move, perceive, remember, and act based on needs.

---

## 21. Risks and Mitigations

### Risk: building too much world logic before visible agent behavior
**Mitigation:** milestone order forces UI and agent visibility early.

### Risk: performance degradation from large global scans
**Mitigation:** chunk-based entity indexing from early versions.

### Risk: terrain too dramatic for world scale
**Mitigation:** explicitly constrained low-relief generation.

### Risk: frontend complexity grows too early
**Mitigation:** canvas-only map first, simple debug sidebar, no premature polish.

---

## 22. Open Future Extensions

These are explicitly future-facing and not blockers for v3 kickoff:

- reproduction,
- inherited traits,
- communication and memory sharing,
- predators,
- humans,
- crafting,
- shelters,
- richer item economy,
- advanced line-of-sight,
- mobile client,
- persistence and save/load,
- complex environmental simulation.

---

## 23. Immediate Next Actions

1. ~~Create backend Express project structure.~~ ~~
2. ~~Create Next.js frontend with Tailwind and TypeScript.~~ ~~
3. ~~Implement wrapped Perlin terrain generation.~~ ~~
4. ~~Expose `/api/world/meta` and `/api/world/viewport`.~~ ~~
5. ~~Build canvas terrain viewer.~~ ~~
6. ~~Add hover inspection.~~ ~~
7. ~~Add static objects.~~ ~~ *(all five types: tree, rock, food, water source, rest spot; chunk-indexed entity API)*
8. ~~Add first agent.~~ *(completed with smooth interpolated movement and pathfinding)*
9. ~~Add perception and memory.~~ *(completed with cone vision, memory decay, and UI visualization)*
10. **Implement survival loop.** *(next - see §16.6)*

---

## 24. Final Scope Lock for Kickoff

For the kickoff of Life Simulation v3, the team should treat the following as locked:

- client-server architecture,
- backend: Node.js + Express + JavaScript,
- frontend: Next.js + TypeScript + Tailwind CSS,
- wrapped world,
- 1m cells,
- approximately 5 km world,
- low-relief wrapped Perlin terrain,
- UI-first delivery,
- agent-first simulation,
- one initial forager agent,
- no climate/hydrology/ecosystem complexity in the first implementation.

This is the implementation starting point.
