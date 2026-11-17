# Life Simulation v3 Backend

Node.js + Express backend for the FlatWorld life simulation. Provides authoritative world state, simulation engine, and REST API.

This is the backend repository for a three-repository project. The [web client](https://github.com/blind675/world-sim-3-client) and [mobile client](https://github.com/blind675/world-sim-3-mobile) are separate viewers. Shared project context is in [Project Overview](docs/PROJECT_OVERVIEW.md), [Product Requirements](docs/PRODUCT_REQUIREMENTS.md), and the [Build Checklist](docs/BUILD_CHECKLIST.md). The requirements and checklist are historical planning documents; code and tests describe current behavior.

Routine work is committed to `staging`; `main` is reserved for an explicitly requested production release. See the [release workflow](docs/RELEASE_WORKFLOW.md) and the [current simulation roadmap](docs/SIMULATION_ROADMAP.md).

## Quick Start

For persistent single-instance deployment, see [docs/DOCKER_DEPLOYMENT.md](docs/DOCKER_DEPLOYMENT.md).

### Docker (Recommended)
```bash
docker-compose up -d
```

### Local Development
```bash
npm install
cp .env.example .env
npm run dev
```

## Architecture

- **Express.js** - HTTP server and routing
- **World Engine** - Deterministic terrain generation and simulation
- **Agent System** - Autonomous agents with perception, memory, and survival needs
- **REST API** - JSON endpoints for world data and simulation control

## Key Modules

- `src/world/world.js` - World singleton and terrain generation
- `src/world/simulation.js` - Main simulation loop and agent behavior
- `src/world/agents.js` - Agent management and pathfinding
- `src/world/objects.js` - World objects (food, water, trees, rocks)
- `src/world/perception.js` - Agent vision and perception system
- `src/world/memory.js` - Agent memory with confidence decay
- `src/world/needs.js` - Survival needs (hunger, thirst, tiredness)
- `src/world/behaviorCatalog.js` and `behaviorScheduler.js` - Validated behavior rules and bounded action scheduling
- `src/routes/` - API endpoint handlers

## Configuration

Production requires `SNAPSHOT_DIR` on a persistent volume and `CONTROL_API_TOKEN` in the server's secret environment. The public frontend remains a viewer; never put this token in `NEXT_PUBLIC_*`. A snapshot is written every `SNAPSHOT_INTERVAL_TICKS` ticks (default 6, or about 120 seconds at the production 20-second tick interval) and on SIGTERM/SIGINT. An abrupt crash can lose at most that interval of simulation progress. Restarts reject incompatible snapshots and fail if neither the current snapshot nor its backup is valid.

All configuration via environment variables. See `.env.example` for complete list.

### Core Settings
- `PORT=4000` - Server port
- `WORLD_WIDTH=5120` - World width in meters
- `WORLD_HEIGHT=5120` - World height in meters
- `TERRAIN_CACHE_MAX_CHUNKS=256` - Maximum terrain chunks retained in memory
- `SIM_TICK_MS=10000` locally, `20000` in production - Wall-clock interval between simulation ticks. With 360 ticks/day, a production day lasts two real hours. This changes viewing pace and processing headroom, not needs or distance per simulated day. Existing snapshots can be restored at a different interval.
- `SIM_TICKS_PER_DAY=360` - Four simulated minutes per tick; one simulated day takes two real hours at the production default interval
- `MOVE_CELLS_PER_STEP=32` - Maximum path cells traversed per two ticks while walking (up to 5.76 km per day if moving continuously on 1 m cells)

### Perception (Milestone 4)
- `VISION_CONE_DEG=100` - Vision cone aperture
- `VISION_NEAR_RADIUS=4` - Near-field vision radius
- `MEMORY_DECAY_FLOOR=0.02` - Memory eviction threshold

### Survival (cassowary-inspired baseline)
- Hunger reaches its lethal limit after seven simulated days without food; thirst after three days without water. Agents start seeking both much earlier.
- Tiredness rises over two days but is not directly lethal. Agents can rest on any walkable cell. A deterministic diurnal or nocturnal preference makes them seek sleep in their inactive half of the day; severe tiredness still triggers off-schedule rest. Night and fatigue shorten vision, with better night adaptation for nocturnal agents. See [Daily Rhythm](docs/DAILY_RHYTHM.md).
- Agents can drink while standing in shallow water or on walkable terrain adjacent to water. Generated water-source and rest-spot objects remain visible for compatibility but are no longer required for survival.
- Thirsty agents without a remembered shoreline use a bounded coarse terrain search (up to 640 m) for a waterward heading. This hint is not stored as a sighting; the agent must still reach and perceive a drinkable shore. Fatal hunger and thirst take precedence over nonfatal tiredness.
- A completed fruit meal also reduces thirst by 0.2 by default; this does not count as drinking in the survival baseline. Tune with `FRUIT_HYDRATION` only after comparing fixed seeds.
- Local air temperature follows simulated time and elevation. Daily seeded weather can cool or warm it; cold slightly increases hunger, heat slightly increases thirst, and rain shortens sight. See [Temperature and Weather](docs/CLIMATE_MODEL.md).

## Docker Deployment

See [Docker Deployment](docs/DOCKER_DEPLOYMENT.md) for the local container workflow and single-instance deployment settings.

### Building
```bash
docker build -t life-sim-backend .
```

### Running with Docker Compose
```bash
docker-compose up -d
```

### Production Considerations
- Use `NODE_ENV=production`
- Keep a persistent volume mounted at `SNAPSHOT_DIR` and configure `CONTROL_API_TOKEN`
- Start with the default 20-second production tick and a 512 MiB memory limit; measure before tuning

## API Endpoints

### Health & Status
- `GET /api/health` - Basic health check
- `GET /api/simulation/status` - Simulation status (tick count, deaths, world clock, ambient light, weather, sea-level air temperature)

### World Data
- `GET /api/world/meta` - World metadata
- `GET /api/world/viewport` - Terrain viewport
- `POST /api/world/chunks` - Batch terrain chunks, generated on demand
- `GET /api/world/cell` - Single cell data
- `GET /api/world/statistics` - Agent, death, and generated-area resource statistics

### Entities
- `GET /api/entities/in-view` - Objects in viewport
- `GET /api/entities/:id` - Object detail; food includes current stock and regrowth status
- `GET /api/object-definitions` - Versioned, read-only object catalogue
- `GET /api/behavior-definitions` - Versioned, read-only behavior catalogue
- `GET /api/agents` - All agents
- `GET /api/agents/:id` - Agent details

Agent summaries now include `type: "agent"`. The in-view response and agent detail include `serverTime` and `lastTickAt` (Unix milliseconds) so viewers can animate each two-tick movement step between polls. These fields describe the current instance's tick clock and are reset appropriately after a snapshot restore.
Agent list and detail responses include `traits.circadianType` and `effectiveVisionRange`; the debug perception route reports that same effective range. The preference is assigned deterministically and saved, while current vision follows the clock and tiredness.
Agent list and detail responses also include local `temperatureC`. The value is derived from the current cell and tick, so viewers can show it without adding mutable snapshot state.
Agent responses also include the active `behavior` record. The checked-in [behavior catalogue](config/behavior-catalog.json) defines bounded idle/look-around action sequences, weighted exploration, and named survival policies. A stay or 90-degree turn consumes one tick; movement, eating, drinking, and resting retain their existing authoritative tick timing. Urgent needs interrupt leisure, and saved behavior progress resumes after a restart. `BEHAVIOR_CATALOG_PATH` can select another validated file at startup, but snapshots pin its hash; changing it requires a deliberate migration or reset. Public viewers cannot edit live behavior rules. See the [behavior model](docs/BEHAVIOR_MODEL.md) for timing and interruption details.
- `POST /api/agents/:id/path` - Set agent path

Object instances expose a `definitionId` for names, colours, sprites, vision blocking, and terrain preferences. The built-in [object catalogue](config/object-catalog.json) preserves legacy positions and adds habitat-specific mushrooms, reeds, and fallen wood at new deterministic positions. Dynamic mushroom offspring can rot. `OBJECT_CATALOG_PATH` can load an alternate validated JSON file at startup. Snapshots pin the catalogue hash, so incompatible edits require an offline migration or a new world.

### Simulation
- `POST /api/sim/step` - Manual simulation step
- `POST /api/admin/world/reset` - Start a fresh world (production bearer token, current `worldId`, and `confirmation: "RESET WORLD"` required)

`GET /api/simulation/status` includes a `worldId` that changes on reset. The reset clears agents, deaths, mutable resources, and tick progress, then persists the fresh world to both snapshot copies. Terrain and static objects regenerate from the configured seed, so they retain the same layout. A reset marker lets startup finish an interrupted reset instead of restoring the previous world. The web app's `/admin/world` page uses a separate password and a server-side proxy; configure its secrets in Netlify as described in the frontend README.

## Development

### Scripts
- `npm run dev` - Development server with nodemon
- `npm start` - Production server
- `npm test` - World generation regression tests
- `npm run bench` - Small terrain chunk benchmark
- `npm run baseline -- --output /tmp/survival.json` - Offline, fixed-seed survival benchmark (defaults to three seeds, 2,500 ticks, and the configured agent count). Use `--seeds 7,8`, `--ticks 500`, `--agents 10`, `--checkpoint-every 100`, and `--output path.json` to adjust a run. It does not start the server, tick timer, or write to the production snapshot volume. See [the baseline report](docs/baselines/README.md) for metric definitions and results.

### Testing
```bash
# Health check
curl http://localhost:4000/api/health

# World metadata
curl http://localhost:4000/api/world/meta

# Sample viewport
curl "http://localhost:4000/api/world/viewport?x=0&y=0&w=32&h=32&layers=height,groundType"
```

## Monitoring

### Health Checks
The Dockerfile health check calls `/api/health`. Inspect status with:
```bash
docker-compose ps  # Show health status
```

### Logs
```bash
docker-compose logs -f backend  # Follow logs
```

### Resource Usage
```bash
docker stats  # Container resource usage
```

## Performance

### Memory Usage
- Base: ~100MB
- Per agent: ~1MB
- World chunks: Loaded on demand

### CPU Usage
- Scales with agent count and world size
- Pathfinding is CPU intensive
- Consider reducing agent count for production

## Troubleshooting

### Common Issues
1. **Port conflicts**: Ensure port 4000 is available
2. **Memory issues**: Reduce world size or agent count
3. **Slow simulation**: Increase `SIM_TICK_MS`

### Debug Mode
Set `DEBUG=*` environment variable for verbose logging.

## Milestone Status

- ✅ **Milestone 0**: Core infrastructure
- ✅ **Milestone 1**: Terrain generation
- ✅ **Milestone 2**: World objects
- ✅ **Milestone 3**: Agent movement
- ✅ **Milestone 4**: Perception & memory
- ✅ **Milestone 5**: Survival loop

## Next Milestones

- Milestone 6: Multi-agent interaction
- Milestone 7: Reproduction & inheritance
- Milestone 8: WebSocket live updates
