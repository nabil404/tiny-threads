---
name: docker-compose-orchestration
description: >
  Use when setting up or modifying multi-container applications with Docker Compose — defining services, wiring inter-container networking, persisting data with volumes, adding health checks/dependency ordering, splitting dev/staging/prod compose configs, or debugging compose issues like services that can't reach each other, volumes not persisting, or failing health checks
---

# Docker Compose Orchestration

Docker Compose declares a multi-container application stack in YAML: services (containers), networks (how they talk to each other), and volumes (persistent data). Services on the same network reach each other by service name — no manual IP wiring needed.

## Core Concepts

```yaml
version: "3.8"

services:      # Individual containers and their configuration
  service-name:
    image: postgres:15-alpine       # or `build:` for a Dockerfile
    ports:
      - "5432:5432"                 # host:container
    environment:
      - KEY=value
    volumes:
      - named-volume:/data          # persistent, or ./local:/path for bind mount
    networks:
      - backend
    depends_on:
      other-service:
        condition: service_healthy  # wait for health check, not just start
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

networks:      # Communication channels between services
  backend:
    driver: bridge

volumes:        # Persistent storage and data sharing
  named-volume:
    driver: local
```

Use `condition: service_healthy` on `depends_on` — a database container starts in milliseconds but may not accept connections for several seconds, so waiting on start alone races the app against the DB.

## Full Reference Files

- **[patterns.md](patterns.md)** — complete working examples: full-stack web app (React + Node + Postgres + Redis), microservices (reverse proxy + services + message broker), dev environment with hot reload, and dev/staging/prod compose file splitting
- **[networking-volumes.md](networking-volumes.md)** — bridge networks, network isolation, aliases, host networking; named volumes, bind mounts, tmpfs, NFS; health check recipes for Postgres/MySQL/MongoDB/Redis/HTTP services
- **[commands.md](commands.md)** — full `docker compose` command reference (up/down/build/logs/exec/scale/profiles), troubleshooting checklist, and project file-layout reference

## Best Practices

- **Pin image tags** — avoid `latest` in production
- **Health checks on every service another service depends on** — otherwise `depends_on` only waits for process start, not readiness
- **Resource limits in production** (`deploy.resources.limits`)
- **Named volumes for persistence**, bind mounts for source-code live-reload only
- **Separate networks** for frontend/backend to isolate the database from public-facing services
- **`.env` files for secrets**, never commit them; use Docker secrets in production
- **`compose.override.yaml`** for local-only dev tweaks (auto-merged, don't commit machine-specific values)
- **One process per container**

## Quick Command Reference

```bash
docker compose up -d              # start detached
docker compose down                # stop and remove containers/networks
docker compose logs -f web         # follow logs for one service
docker compose exec web sh         # shell into a running service
docker compose config              # validate merged config
docker compose -f compose.yaml -f compose.prod.yaml up -d   # merge prod overlay
```

See [commands.md](commands.md) for the complete command set and troubleshooting steps.
