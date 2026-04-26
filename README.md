# Life Simulation v3 Backend

Node.js + Express backend for the FlatWorld life simulation. Provides authoritative world state, simulation engine, and REST API.

## Quick Start

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

All configuration via environment variables. See `.env.example` for complete list.

### Core Settings
- `PORT=4000` - Server port
- `WORLD_WIDTH=5120` - World width in meters
- `WORLD_HEIGHT=5120` - World height in meters
- `SIM_TICK_MS=200` - Simulation tick interval

### Perception (Milestone 4)
- `VISION_CONE_DEG=100` - Vision cone aperture
- `VISION_NEAR_RADIUS=4` - Near-field vision radius
- `MEMORY_DECAY_FLOOR=0.02` - Memory eviction threshold

### Survival (Milestone 5)
- `HUNGER_DECAY_RATE=0.0003` - Hunger increase per tick
- `THIRST_DECAY_RATE=0.0005` - Thirst increase per tick
- `TIREDNESS_DECAY_RATE=0.0002` - Tiredness increase per tick

## Docker Deployment

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
- Increase `SIM_TICK_MS` for production (1000ms recommended)
- Set memory limits (512M recommended)
- Enable health checks

## API Endpoints

### Health & Status
- `GET /api/health` - Basic health check
- `GET /api/simulation/status` - Simulation status (tick count, deaths)

### World Data
- `GET /api/world/meta` - World metadata
- `GET /api/world/viewport` - Terrain viewport
- `GET /api/world/cell` - Single cell data

### Entities
- `GET /api/entities/in-view` - Objects in viewport
- `GET /api/agents` - All agents
- `GET /api/agents/:id` - Agent details
- `POST /api/agents/:id/path` - Set agent path

### Simulation
- `POST /api/sim/step` - Manual simulation step
- `GET /api/deaths` - Death records

## Development

### Scripts
- `npm run dev` - Development server with nodemon
- `npm start` - Production server

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
Docker includes built-in health checks:
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
