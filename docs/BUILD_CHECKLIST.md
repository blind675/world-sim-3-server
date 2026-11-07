# Life Simulation v3 — Build Checklist

> Historical implementation checklist imported from the original workspace.
> Some entries describe the former single-repository layout or old defaults.
> The current backend and frontend are separate repositories; consult their
> READMEs and source code before treating a checked item as current behavior.

**Purpose:** implementation checklist for project kickoff and early milestones

**Scope:** backend, frontend, terrain viewer, static objects, and first agent foundation

> **Progress (Nov 2026):** The core terrain viewer, agent movement, perception, memory, and survival loop are implemented. Terrain and objects are generated lazily, terrain caching is bounded, and the world seed controls static placement and wandering. Resource sharing now tracks occupancy and waiters. Death location markers, a death API, and agent repulsion are still open items. Refer to the running code and the unchecked items below for current scope.

---

## 1. Repository and Workspace Setup

### 1.1 Repository
- [x] Create a new v3 repository
- [x] Add root `README.md`
- [x] Add `.gitignore`
- [x] Add root workspace structure:
  - [x] `backend/`
  - [x] `frontend/`
- [ ] Add root `docs/` folder for decisions and notes
- [x] Add root `.editorconfig`
- [ ] Add root formatting/linting conventions

### 1.2 Branching and basics
- [x] Set up `main` branch
- [ ] Define branch naming convention
- [ ] Define commit naming convention
- [x] Add initial project description to README

---

## 2. Backend Setup — Node + Express + JavaScript

### 2.1 Project bootstrap
- [x] Initialize backend with `npm init`
- [x] Install Express
- [x] Install CORS middleware
- [x] Install environment variable support (`dotenv`)
- [x] Install development tooling (`nodemon`)
- [x] Create backend folder structure:
  - [x] `src/app.js`
  - [x] `src/server.js`
  - [x] `src/config/`
  - [x] `src/world/`
  - [ ] `src/entities/` *(not needed yet)*
  - [ ] `src/simulation/` *(not needed yet)*
  - [x] `src/routes/`
  - [x] `src/utils/`
  - [ ] `src/sockets/` *(not needed yet)*
- [x] Add Docker support *(Dockerfile, .dockerignore, docker-compose.yml)*
- [x] Add Docker deployment documentation

### 2.2 Express app foundation
- [x] Create Express app
- [x] Enable JSON middleware
- [x] Enable CORS for frontend origin
- [x] Add health-check route
- [x] Add basic error handler
- [x] Add not-found route handler

### 2.3 Scripts
- [x] Add `dev` script
- [x] Add `start` script
- [x] Confirm backend starts locally
- [x] Confirm Docker container builds and runs
- [x] Test Docker health checks

### 2.4 Config
- [x] Create `.env` file *(`.env.example` provided)*
- [x] Add `PORT`
- [x] Add world seed config
- [x] Add world size config
- [x] Add chunk size config
- [x] Add simulation tick interval config *(`tickMs` with default 200ms)*

---

## 3. Frontend Setup — Next + TypeScript + Tailwind

### 3.1 Project bootstrap
- [x] Create Next.js app with TypeScript
- [x] Install and verify Tailwind CSS
- [x] Set up `src/` structure
- [x] Create folder structure:
  - [x] `src/app/`
  - [x] `src/components/`
  - [ ] `src/hooks/` *(not needed yet)*
  - [x] `src/lib/`

### 3.2 Frontend foundation
- [x] Create root layout
- [x] Create base page
- [x] Create basic app shell layout
- [x] Add Tailwind styling for:
  - [x] page layout
  - [x] sidebar
  - [x] header/status row
  - [x] controls panel

### 3.3 API utilities
- [x] Add backend base URL config
- [x] Create API helper module
- [x] Create shared TS types for backend responses
- [x] Verify frontend can call backend health-check endpoint *(via `/api/world/meta`)*

---

## 4. Shared Project Decisions

- [x] Lock world topology as wrapped
- [x] Lock cell size as 1m x 1m
- [x] Lock world size as 5120 x 5120
- [x] Lock chunk size as 128 x 128
- [x] Lock backend authority over simulation state
- [x] Lock first terrain generator as wrapped/circular Perlin noise *(4D Perlin with integer cycle counts)*
- [x] Lock first UI target as terrain visualizer on canvas
- [x] Lock first agent type as generic forager

---

## 5. World Configuration and Core Types

### 5.1 World config
- [x] Create world config module
- [x] Add seed
- [x] Add width
- [x] Add height
- [x] Add cell size
- [x] Add chunk size
- [x] Add terrain min/max height range

### 5.2 Core world helpers
- [x] Implement `wrapX()`
- [x] Implement `wrapY()`
- [x] Implement chunk coordinate helpers
- [x] Implement local-in-chunk coordinate helpers
- [ ] Implement distance helper for wrapped world if needed *(deferred; not needed yet)*

### 5.3 Core response shapes
- [x] Define world meta response shape
- [x] Define viewport response shape
- [x] Define entity-in-view response shape *(`EntitiesInViewResponse` with `{ id, type, x, y }` objects)*
- [ ] Define agent detail response shape *(no agents yet)*

---

## 6. Terrain Generation

### 6.1 Noise implementation
- [x] Add Perlin noise implementation *(4D Perlin for toroidal wrapping)*
- [x] Make noise deterministic from seed
- [x] Make terrain wrap seamlessly
- [x] Verify left/right edges match
- [x] Verify top/bottom edges match

### 6.2 Height generation
- [x] Implement height sampler function
- [x] Map noise output into low-relief height range
- [x] Add support for shallow basins and gentle hills
- [x] Keep terrain appropriate for ~5 km world

### 6.3 Terrain derivation
- [x] Derive ground type from terrain rules
- [x] Derive movement cost baseline from ground type
- [ ] Derive vision blocking flags where needed *(deferred; no perception yet)*
- [x] Add placeholder water depth support to schema

### 6.4 Terrain acceptance checks
- [x] Terrain renders without seams
- [x] Height range stays within configured limits
- [x] Terrain visually feels local, not continental
- [x] Terrain supports meaningful but moderate slope variation

---

## 7. Backend World APIs

### 7.1 `GET /api/world/meta`
- [x] Implement route
- [x] Return width
- [x] Return height
- [x] Return cell size
- [x] Return seed
- [x] Return chunk size
- [x] Return wrap mode
- [x] Test from browser/frontend

### 7.2 `GET /api/world/viewport`
- [x] Implement route
- [x] Support `x`, `y`, `w`, `h`
- [x] Support requested layers
- [x] Return terrain heights for viewport
- [x] Return derived ground type if requested
- [x] Ensure wrapped sampling works across boundaries
- [x] Add validation for invalid params

### 7.2b `POST /api/world/chunks` *(added for batch fetch)*
- [x] Accept a list of `(cx, cy)` and requested layers
- [x] Return per-chunk arrays (`height`, `groundType`, `waterDepth`, `moveCost`)
- [x] Cap at `MAX_CHUNKS_PER_BATCH = 64` per request
- [x] Used by the frontend to fetch up to 32 chunks per HTTP call

### 7.3 Viewport tests
- [x] Request a small viewport successfully
- [x] Request a viewport crossing the world edge
- [x] Confirm wrapped output is seamless
- [x] Confirm performance is acceptable for development *(batch chunk fetch keeps pan smooth)*

### 7.4 Simulation status API
- [x] Implement `GET /api/simulation/status` endpoint
- [x] Return tick count, tick interval, and agent count
- [x] Remove simulation control endpoints *(start, stop, tick)*
- [x] Auto-start simulation on backend startup
- [x] Optimize frontend polling to fetch at tick interval instead of adaptive 2s/10s

---

## 8. Frontend Terrain Viewer

### 8.1 Canvas viewer
- [x] Create `MapCanvas` component
- [x] Render viewport data onto canvas
- [x] Add camera state
- [x] Add panning *(drag)*
- [x] Add zooming *(wheel, zooms toward cursor)*
- [x] Add resize handling *(ResizeObserver)*

### 8.2 UI controls
- [x] Add layer selector *(height / groundType / waterDepth)*
- [x] Add viewport refresh behavior *(chunk cache auto-invalidates on layer switch)*
- [x] Add debug status area *(bottom-left HUD + sidebar)*
- [x] Add coordinate display

### 8.3 Inspection
- [x] Add hover-to-inspect tile
- [x] Show tile coordinates
- [x] Show tile height
- [x] Show tile ground type
- [x] Show movement cost if available

### 8.4 Viewer acceptance
- [x] Map is visible on first load
- [x] Pan works smoothly *(chunk cache + batch fetch)*
- [x] Zoom works smoothly *(chunk-based min/max zoom bounds)*
- [x] Hover inspection works
- [x] Wrapped terrain appears continuous

### 8.5 Tutorial system *(added)*
- [x] Create TutorialModal component with 5 interactive pages
- [x] Implement first-visit detection using localStorage
- [x] Add visual entity guide with symbols and colors
- [x] Add tutorial navigation (Previous/Next/Skip/Start Exploring)
- [x] Add progress indicator across tutorial pages
- [x] Add "Show Tutorial" button to sidebar for revisiting
- [x] Cover simulation overview, world, entities, agents, and mechanics
- [x] Add visual examples of terrain, needs, vision, and pathfinding

### 8.6 Bonus UX (shipped alongside Milestone 1)
- [x] Visible chunk grid overlay (toggleable, auto-hidden when cells are tiny)
- [x] Chunk-based zoom bounds: min ~1/3 chunk visible, max ~10x8 chunks visible
- [x] Chunk prefetch padding (2 chunks around the viewport)
- [x] Batch chunk fetch (32 chunks per HTTP call, camera-proximity priority)
- [x] Click-to-select cell with white outline + dark halo for contrast
- [x] Experimental vector chamfer overlay for octagonal cell shapes *(parked on UI branch; marching-squares rule, `CHAMFER_FRAC = 0.33`)*

---

## 9. Chunk Index and Spatial Partitioning

### 9.1 Chunk structure
- [x] Create chunk index structure
- [x] Add `itemIds`
- [x] Add `objectIds`
- [x] Add `agentIds`
- [x] Add helper to get chunk from world coordinates

### 9.2 Query helpers
- [x] Get nearby chunks for radius query *(wrap-aware `chunksInRect`)*
- [x] Get entities in viewport using chunk lookup
- [x] Avoid global entity scans for nearby queries

### 9.3 Validation
- [x] Add one entity to a chunk correctly *(exercised by object store registration)*
- [x] Move one entity between chunks correctly *(helper present; unused until agents land)*
- [x] Query nearby chunks correctly across world wrap *(smoke-tested with wrap-crossing rects)*

---

## 10. Static World Objects

### 10.1 Object schema
- [x] Define object shape *(`{ id, type, x, y }`)*
- [x] Define supported object types:
  - [x] tree
  - [x] rock
  - [x] food node
  - [x] water source
  - [x] rest spot

### 10.2 Placement
- [x] Add initial object placement pass *(lazy, deterministic per chunk)*
- [x] Place trees in allowed terrain *(forest density field, 2-octave seamless noise)*
- [x] Place rocks in allowed terrain *(outcrop density field, ridge-like peaks)*
- [x] Place food nodes in allowed terrain *(berry density field, mid-frequency patches)*
- [x] Place water sources/zones in allowed terrain *(shoreline: shallow_water + mud, depth <= 1.2 m)*
- [x] Place rest spots in allowed terrain *(dense forest interior, `forestDensity >= 0.55`)*

### 10.3 Rendering
- [x] Return objects in viewport API or separate entity API *(`GET /api/entities/in-view`)*
- [x] Render static objects in frontend overlay *(per-type glyphs: green circle, gray triangle, red berry, blue droplet, tan square)*
- [x] Add object hover/select support *(10px screen-space hit-test; objects take priority over cell selection)*

### 10.4 Acceptance
- [x] Objects are visible on map
- [x] Objects appear in believable areas *(forests, outcrops, shorelines, berry patches, forest interior)*
- [x] Object queries do not require full-world scan *(chunk-scoped `chunksInRect` + per-chunk lazy generation)*

---

## 11. Agent Foundation

### 11.1 Agent schema
- [x] Define agent model *(in-memory; `backend/src/world/agents.js`)*
- [x] Add required fields:
  - [x] id
  - [x] x
  - [x] y
  - [x] facing
  - [x] sex
  - [x] age
  - [x] state
  - [x] currentGoal
  - [x] currentAction
  - [x] hunger *(placeholder value; not driving behaviour yet)*
  - [x] thirst *(placeholder)*
  - [x] tiredness *(placeholder)*
  - [x] inventory *(empty array)*
  - [x] memory *(empty array; populated in M4)*
  - [x] traits *(visionRange, memoryCapacity, memoryDecayRate, moveSpeed)*

### 11.2 Agent spawning
- [x] Add initial agent spawn logic *(4 deterministic foragers from seed, `AGENT_COUNT` env override)*
- [x] Place agent in valid location *(rejects deep water / non-land cells)*
- [x] Register agent in chunk index *(`chunkIndex.addAgentId` on spawn, `moveAgent` on every step)*

### 11.3 Rendering and inspection
- [x] Return agents in viewport/entity response *(`/api/entities/in-view` now includes `{type:'agent',facing,state}` and accepts `types=agent`)*
- [x] Render agents on map *(orange circle + facing arrow, wrap-aware placement)*
- [x] Allow selecting agent *(click priority: agent > object > cell; `GET /api/agents/:id` drives the detail panel)*
- [x] Add agent debug panel *(Selected Agent sidebar section)*
- [x] Show current state and coordinates

---

## 12. Movement and Pathfinding

### 12.1 Movement rules
- [x] Implement walkability checks *(shared predicate `isBlocked` in pathfinding)*
- [x] Implement move cost calculation from terrain *(A* g-cost uses `baseMoveCost`)*
- [x] Respect world wrapping *(neighbours + heuristic are toroidal)*
- [x] Block movement in invalid water depth zones if enabled *(`deep_water` + `waterDepth > DEEP_WATER_THRESHOLD` are impassable)*

### 12.2 A* pathfinding
- [x] Implement grid A* *(4-directional, binary-heap open set, cap `maxNodes = 200000`)*
- [x] Use wrapped coordinates correctly *(neighbours wrap via `wrap()`, heuristic is wrapped Manhattan)*
- [x] Use terrain cost in pathfinding
- [x] Return path for debugging *(`POST /api/agents/:id/path` returns the computed path)*

### 12.3 Path debug
- [x] Render selected path in UI *(yellow polyline, wrap-split)*
- [x] Show path target *(yellow dot at the end of the polyline)*
- [x] Confirm agent follows path as expected *(Step / ×10 / ×50 buttons in Simulation sidebar)*

### 12.4 Acceptance
- [x] Agent can navigate around obstacles *(deep water is routed around)*
- [x] Agent can traverse wrapped boundaries correctly *(path + rendering are wrap-aware)*
- [x] Path output is inspectable in UI

### 12.5 Smooth Movement Animation *(added)*
- [x] Implement continuous 60fps rendering loop using `requestAnimationFrame`
- [x] Add real-time position interpolation between movement start and target positions
- [x] Synchronize animation duration with simulation tick interval (`tickMs / moveSpeed`)
- [x] Implement two-phase backend movement system (start position recorded, position updated on completion)
- [x] Add movement start time tracking per agent to prevent animation conflicts
- [x] Implement proper cleanup of movement data when steps complete
- [x] Remove simulation control endpoints and implement auto-start behavior
- [x] Optimize API polling to fetch tick count at SIM_TICK_MS interval (200ms)
- [x] Fix React rendering error for `currentGoal` object type
- [x] Fix agent idle behavior with increased goal-setting probability (30%) and goal clearing on completion
- [x] Fix animation timing to prevent rapid snapping/repeating

---

## 13. Perception and Memory

### 13.1 Vision
- [x] Implement cone-based vision *(100° front cone + 4-cell omnidirectional near-field radius)*
- [x] Use facing direction *(cone centered on agent's facing angle)*
- [x] Use vision range *(configurable via `traits.visionRange`, default 20 cells)*
- [x] Detect visible objects *(trees, rocks, food, water sources, rest spots)*
- [x] Detect visible items *(food items when implemented)*
- [x] Detect visible agents *(other agents in vision cone/near-field)*
- [x] Respect simple vision blocking *(Bresenham LOS with `blocksVision` cells + opaque objects)*

### 13.2 Memory
- [x] Define memory entry shape *(`{id, type, x, y, firstSeenTick, lastSeenTick, confidence}`)*
- [x] Store observed type and location *(type, x, y recorded on perception)*
- [x] Store last seen tick/time *(refreshed to current tick when visible)*
- [x] Store confidence score *(1.0 when visible, decays otherwise)*
- [x] Add confidence decay over time *(1% per tick by default, configurable via `traits.memoryDecayRate`)*

### 13.3 Memory usage
- [x] Allow agent to select target from memory *(60% of idle goals target highest-confidence food/water)*
- [x] Prefer fresher / higher-confidence memories *(sorted by confidence, recency tiebreak)*
- [x] Expose memory list in debug panel *(MemoryPanel in sidebar with type chips, confidence bars, ticks-since-seen)*

### 13.4 Acceptance
- [x] Agent can perceive nearby targets *(verified via `/api/agents/:id/perception` debug endpoint)*
- [x] Agent remembers observed targets *(memory array populates and persists across ticks)*
- [x] Memory confidence decays over time *(observed 0.99^N decay matches expected rate)*
- [x] Memory state is visible in frontend *(vision cone overlay, memory dots, sidebar panel)*

---

## 14. Needs and Basic Decision Loop

### 14.1 Needs
- [x] Add hunger decay
- [x] Add thirst decay
- [x] Add tiredness decay

### 14.2 Behavior selection
- [x] Implement simple priority or utility model
- [x] Seek water when thirsty
- [x] Seek food when hungry
- [x] Seek rest spot when tired
- [x] Wander/explore when stable

### 14.3 Action execution
- [x] Drink action
- [x] Eat action
- [x] Rest action
- [x] Move-to-target action

### 14.4 Food system
- [x] Food depletion and regrowth
- [x] Dynamic food spreading
- [x] Local density caps

### 14.5 Death tracking
- [ ] Death location recording
- [x] Death cause determination
- [ ] Visual death markers
- [ ] Death API endpoint

### 14.6 Memory improvements
- [x] Extend clustering to rocks and food
- [x] Slower individual memory decay
- [x] Memory inspection modal

### 14.7 Acceptance
- [x] Agent behavior changes as needs change
- [x] Agent survives longer when resources are available
- [x] Current goal and action are visible in UI
- [ ] Death locations are visually tracked
- [x] Memory clustering works for multiple entity types

---

## 15. Multiple Agents and Basic Interactions

### 15.1 Multi-agent presence
- [x] Verify system supports higher agent counts (50+ agents)
- [x] Test frontend performance with multiple agents
- [x] Validate chunk-based spatial querying scales properly

### 15.2 Agent-to-agent awareness
- [x] Implement agent detection in perception system
- [x] Add other agents to visible entities list
- [x] Store basic information about nearby agents in memory

### 15.3 Simple collision avoidance
- [x] Implement pathfinding that avoids other agents
- [ ] Add repulsion behavior when agents get too close
- [ ] Test agent movement in crowded areas

### 15.4 Acceptance
- [x] System supports multiple simultaneous agents without performance degradation
- [x] Frontend remains usable with higher agent counts
- [x] Agents can detect and avoid other agents
- [x] No global scans required for nearby agent queries

---

## 16. Memory Sharing and Communication

### 16.1 Communication foundation
- [ ] Define communication range and protocols
- [ ] Implement agent-to-agent message passing
- [ ] Add communication events to simulation loop

### 16.2 Memory sharing mechanics
- [ ] Allow agents to exchange memory entries
- [ ] Implement trust/reputation for shared information
- [ ] Add reliability constraints to communication

### 16.3 Information propagation
- [ ] Enable information to spread through agent networks
- [ ] Implement memory validation and decay for shared info
- [ ] Test emergent information network formation

### 16.4 UI visualization
- [ ] Add visual indicators for communication events
- [ ] Show shared information in agent inspection panels
- [ ] Display information propagation patterns

### 16.5 Acceptance
- [ ] Agents can exchange memory entries with nearby agents
- [ ] Shared information propagates through agent populations
- [ ] Communication has range and reliability constraints
- [ ] UI shows when agents are sharing information
- [ ] Emergent information networks form organically

---

## 17. WebSocket / Live Updates

### 17.1 Socket foundation
- [ ] Add WebSocket support to backend
- [ ] Add frontend socket client
- [ ] Establish connection on app load

### 17.2 Live update payloads
- [ ] Tick updates
- [ ] Changed agents
- [ ] Selected agent refreshes
- [ ] Optional viewport invalidation signal

### 17.3 Acceptance
- [ ] Frontend receives live changes
- [ ] Selected agent panel updates without manual refresh

---

## 18. Debugging and Developer UX

- [x] Add backend request logging *(per-request method + path + status logger)*
- [x] Add simulation tick logging in development *(logs every 100 ticks)*
- [x] Add frontend debug status panel *(sidebar with World, Overlays, Hover/Selected Tile, Hover/Selected Object sections)*
- [x] Show current tick/time *(auto-fetched at tick interval)*
- [x] Show selected tile info
- [x] Show selected agent info *(sidebar panel with agent details)*
- [x] Add layer toggle support *(height / groundType / waterDepth)*
- [x] Add optional chunk overlay later *(toggleable red chunk grid, auto-hidden when cells are tiny)*

---

## 19. Build Acceptance Gates

### Gate A — Foundation complete ✅
- [x] Backend runs
- [x] Frontend runs
- [x] Frontend reaches backend successfully

### Gate B — Terrain viewer complete ✅
- [x] Terrain is generated deterministically
- [x] Terrain wraps seamlessly
- [x] UI shows terrain on canvas
- [x] Pan/zoom/inspect work

### Gate C — Static world complete
- [x] Objects are placed and visible
- [x] Viewport/entity querying works

### Gate D — First agent complete
- [x] Agent is visible *(4 foragers; configurable via `AGENT_COUNT`)*
- [x] Agent can move *(auto-running simulation at 200ms intervals)*
- [x] Agent can pathfind *(wrap-aware A*, deep-water-blocking)*
- [x] Agent can be inspected *(sidebar panel + `/api/agents/:id`)*
- [x] Agent movement is smooth and animated
- [x] Simulation runs automatically without manual controls
- [x] Frontend efficiently polls tick count at simulation interval

### Gate E — First survival loop complete **Closed**
- [x] Agent perceives world *(cone + near-field vision with LOS)*
- [x] Agent remembers observations *(memory with confidence decay)*
- [x] Agent acts from needs *(memory-biased wander goals)*
- [x] Agent behavior is understandable in UI *(vision overlay, memory panel, goal provenance)*
- [x] Tutorial system provides comprehensive onboarding for new users
- [x] Tutorial automatically appears for first-time visitors
- [x] Users can revisit tutorial anytime via sidebar button

### Gate F — Multiple agents complete *(next)*
- [ ] System supports higher agent counts (50+ agents) without performance degradation
- [ ] Frontend remains usable with multiple agents
- [ ] Agents can detect and avoid other agents
- [ ] Basic collision avoidance works in crowded areas

### Gate G — Memory sharing complete *(future)*
- [ ] Agents can exchange memory entries with nearby agents
- [ ] Communication has range and reliability constraints
- [ ] UI shows when agents are sharing information
- [ ] Information propagates through agent populations

---

## 20. Recommended Build Order

1. [x] Backend Express app
2. [x] Frontend Next app
3. [x] World config and wrap helpers
4. [x] Wrapped Perlin terrain sampler
5. [x] `/api/world/meta`
6. [x] `/api/world/viewport`
7. [x] Frontend canvas terrain viewer
8. [x] Hover inspection
9. [x] Chunk index
10. [x] Static objects
11. [x] First agent schema and spawn
12. [x] Agent rendering
13. [x] Movement and A*
14. [x] Vision and memory
15. [x] Needs and action loop *(M5)*
16. [ ] Multiple agents and basic interactions *(M6)*
17. [ ] Memory sharing and communication *(M7)*
18. [ ] WebSocket live updates *(technical improvement)*

---

## 21. Nice-to-Have Later

- [ ] mobile client
- [ ] reproduction
- [ ] multiple agent species
- [ ] trait inheritance
- [ ] save/load system
- [ ] chunk persistence
- [ ] richer UI polish
- [ ] performance profiling tools

---

## 22. Definition of “Ready to Build”

The project is ready for active implementation when:
- [x] stack is locked
- [x] folder structures exist
- [x] world size and chunk size are locked
- [x] terrain generator approach is locked
- [x] first viewer scope is locked
- [x] first agent archetype is locked
- [x] initial APIs are defined
- [x] milestone order is accepted
