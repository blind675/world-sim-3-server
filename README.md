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
- `src/routes/` - API endpoint handlers

## Configuration

Production requires `SNAPSHOT_DIR` on a persistent volume and `CONTROL_API_TOKEN` in the server's secret environment. The public frontend remains a viewer; never put this token in `NEXT_PUBLIC_*`. A snapshot is written every `SNAPSHOT_INTERVAL_TICKS` ticks (default 6, or about 60 seconds with the default tick interval) and on SIGTERM/SIGINT. An abrupt crash can lose at most that interval of simulation progress. Restarts reject incompatible snapshots and fail if neither the current snapshot nor its backup is valid.

All configuration via environment variables. See `.env.example` for complete list.

### Core Settings
- `PORT=4000` - Server port
- `WORLD_WIDTH=5120` - World width in meters
- `WORLD_HEIGHT=5120` - World height in meters
- `TERRAIN_CACHE_MAX_CHUNKS=256` - Maximum terrain chunks retained in memory
- `SIM_TICK_MS=10000` - Default simulation tick interval

### Perception (Milestone 4)
- `VISION_CONE_DEG=100` - Vision cone aperture
- `VISION_NEAR_RADIUS=4` - Near-field vision radius
- `MEMORY_DECAY_FLOOR=0.02` - Memory eviction threshold

### Survival (Milestone 5)
- `HUNGER_DECAY_RATE=0.0003` - Hunger increase per tick
- `THIRST_DECAY_RATE=0.0005` - Thirst increase per tick
- `TIREDNESS_DECAY_RATE=0.0002` - Tiredness increase per tick

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
- Start with the default 10-second tick and a 512 MiB memory limit; measure before tuning

## API Endpoints

### Health & Status
- `GET /api/health` - Basic health check
- `GET /api/simulation/status` - Simulation status (tick count, deaths)

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
- `GET /api/agents` - All agents
- `GET /api/agents/:id` - Agent details

Agent summaries now include `type: "agent"`. The in-view response and agent detail include `serverTime` and `lastTickAt` (Unix milliseconds) so viewers can animate each two-tick movement step between polls. These fields describe the current instance's tick clock and are reset appropriately after a snapshot restore.
- `POST /api/agents/:id/path` - Set agent path

Object instances retain their existing `type` and stable id, and now expose a `definitionId` for names, colours, sprites, vision blocking, and terrain preferences. The built-in [catalogue](config/object-catalog.json) adds pine trees, slate rocks, and blueberry bushes without changing object placement or resource behavior. Variant weights choose appearances among positions generated by the existing forest, outcrop, berry, shoreline, and rest strategies; they do not change object counts. `OBJECT_CATALOG_PATH` can load an alternate validated JSON file at startup. Snapshots pin the catalogue hash, so incompatible edits require an offline migration or a new world.

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
