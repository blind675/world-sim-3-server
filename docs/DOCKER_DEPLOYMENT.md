# Docker Deployment

This guide replaces the original workspace Docker notes, which were written for an older version of the project. It describes the current backend repository; the frontend is a separate [Git repository](https://github.com/blind675/world-sim-3-client).

## Local container

From the backend repository root:

```bash
docker compose up --build -d
docker compose ps
curl http://localhost:4000/api/health
```

The image is defined by `Dockerfile`; local settings are in `docker-compose.yml`. For production-like settings, use `docker compose -f docker-compose.prod.yml up --build -d`. The production compose file sets a 750 ms simulation tick, 512 MiB memory limit, and 0.5 CPU limit. Adjust these using measurements from realistic runs.

## Configuration

`PORT`, `CORS_ORIGIN`, `SIM_TICK_MS`, `WORLD_SEED`, world dimensions, agent count, terrain cache limit, and behavior settings are environment variables. See `.env.example` and `src/config/worldConfig.js`. Set `CORS_ORIGIN` to the deployed frontend's HTTPS origin. Set the frontend's `NEXT_PUBLIC_BACKEND_URL` to the deployed backend URL when building the web app.

## Before public cloud deployment

1. Add snapshot persistence and restoration for live simulation state. The current process holds agents, needs, memories, resources, and tick progress in memory. Reusing the seed only recreates static world data.
2. Keep one authoritative simulation instance until state coordination is designed. Multiple replicas would each run their own tick loop and diverge.
3. Protect simulation-changing API routes before exposing them publicly.
4. Correct the `Dockerfile` health check: it currently requests `/api/world/status`, while the implemented health route is `/api/health`. Verify the container reports healthy after the change.
5. Use an always-on service for a continuously advancing simulation. A host that scales to zero pauses the timer.

The backend's root filesystem is not durable on typical cloud containers. Adding a volume alone does not preserve in-memory state; the application must write and restore snapshots on durable storage. A production deployment also needs a backup and recovery procedure.

## Useful checks

```bash
docker compose logs -f backend
docker stats
curl http://localhost:4000/api/simulation/status
```
