# Life Simulation v3 — Project Overview

This overview preserves the useful context from the original workspace README.
The project is split across two Git repositories:

- [Backend](https://github.com/blind675/world-sim-3-server): Node.js and Express; authoritative world, simulation, agents, and REST API.
- [Frontend](https://github.com/blind675/world-sim-3-client): Next.js, TypeScript, and Tailwind; canvas viewer and inspection panels.

The simulation is agent-first: a deterministic, wrapped 5120 × 5120 cell world supports autonomous agents that move, perceive, remember, and respond to hunger, thirst, and tiredness. The browser shows terrain, resources, agents, and simulation statistics. Milestones 0–5 are substantially implemented; the [PRD](PRODUCT_REQUIREMENTS.md) and [checklist](BUILD_CHECKLIST.md) contain the longer-term vision and historical progress notes.

## Design decisions

- The backend owns live simulation state and advances it on a configured timer.
- Terrain uses a 2D-to-4D Perlin mapping for seamless wrapping in both directions.
- Terrain chunks and seeded static objects are generated on demand. The terrain cache is bounded; a full world heightmap is not built at startup.
- Viewport and chunk APIs serve only requested map data. Resource statistics report coverage of generated chunks.
- The frontend reads `NEXT_PUBLIC_BACKEND_URL` and polls the backend for updates.

## Run locally

Start the backend from this repository with `npm install`, `cp .env.example .env`, and `npm run dev`. Start the frontend from its repository with `npm install`, `cp .env.local.example .env.local`, and `npm run dev`. Defaults are `http://localhost:4000` for the API and `http://localhost:3000` for the web app. See each repository README for details.

## Current deployment gaps

Live agent and resource state is held in memory. A process restart loses that progress even though the seed can reproduce static terrain and object placement. Production hosting needs snapshots and recovery. The API also exposes simulation-changing endpoints that need access control before public deployment. See [Docker Deployment](DOCKER_DEPLOYMENT.md) for container-specific details.

Planned later work includes mobile layout and installability, live updates, multi-agent interactions, reproduction, and trait inheritance. The backend API is intended to serve both web and future mobile clients.
