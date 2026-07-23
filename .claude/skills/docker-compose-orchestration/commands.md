# Commands, Troubleshooting, and Advanced Usage

## Essential Docker Compose Commands

### Project Management

```bash
# Start services
docker compose up                    # Foreground
docker compose up -d                 # Detached (background)
docker compose up --build            # Rebuild images
docker compose up --force-recreate   # Recreate containers
docker compose up --scale web=3      # Scale service to 3 instances

# Stop services
docker compose stop                  # Stop containers
docker compose down                  # Stop and remove containers/networks
docker compose down -v               # Also remove volumes
docker compose down --rmi all        # Also remove images

# Restart services
docker compose restart               # Restart all services
docker compose restart web           # Restart specific service
```

### Service Management

```bash
# Build services
docker compose build                 # Build all services
docker compose build web             # Build specific service
docker compose build --no-cache      # Build without cache
docker compose build --pull          # Pull latest base images

# View services
docker compose ps                    # List containers
docker compose ps -a                 # Include stopped containers
docker compose top                   # Display running processes
docker compose images                # List images

# Logs
docker compose logs                  # View all logs
docker compose logs -f               # Follow logs
docker compose logs web              # Service-specific logs
docker compose logs --tail=100 web   # Last 100 lines
```

### Execution and Debugging

```bash
# Execute commands
docker compose exec web sh           # Interactive shell
docker compose exec web npm test     # Run command
docker compose exec -u root web sh   # Run as root

# Run one-off commands
docker compose run web npm install   # Run command in new container
docker compose run --rm web test     # Remove container after
docker compose run --no-deps web sh  # Don't start dependencies
```

### Configuration Management

```bash
# Multiple compose files
docker compose -f compose.yaml -f compose.prod.yaml up

# Environment-specific deployment
docker compose --env-file .env.prod up
docker compose -p myproject up       # Custom project name

# Configuration validation
docker compose config                # Validate and view config
docker compose config --quiet        # Only validation
docker compose config --services     # List services
docker compose config --volumes      # List volumes
```

## Environment-Specific Deployments

```bash
# Development
docker compose up

# Staging
docker compose -f compose.yaml -f compose.staging.yaml up

# Production
docker compose -f compose.yaml -f compose.prod.yaml up -d

# With environment file
docker compose --env-file .env.prod -f compose.yaml -f compose.prod.yaml up -d
```

## Scaling Services

```bash
# Scale specific service
docker compose up -d --scale worker=5

# Scale multiple services
docker compose up -d --scale worker=5 --scale consumer=3
```

## Conditional Service Activation with Profiles

```yaml
services:
  web:
    image: nginx
    # Always starts

  debug:
    image: debug-tools
    profiles:
      - debug  # Only starts with --profile debug

  test:
    build: .
    profiles:
      - test   # Only starts with --profile test
```

```bash
# Start with debug profile
docker compose --profile debug up

# Start with multiple profiles
docker compose --profile debug --profile test up
```

## Troubleshooting

### Services can't communicate

- Check network configuration
- Verify service names are correct
- Ensure services are on same network
- Check firewall rules

### Volumes not persisting

- Verify named volumes are defined
- Check volume mount paths
- Ensure proper permissions
- Review Docker volume driver

### Services failing health checks

- Increase start_period
- Verify health check command
- Check service logs
- Ensure dependencies are ready

### Port conflicts

- Check for existing services on ports
- Use different host ports
- Review port mapping syntax

### Build failures

- Clear build cache: `docker compose build --no-cache`
- Check Dockerfile syntax
- Verify build context
- Review build arguments

### Debugging Commands

```bash
# View detailed container information
docker compose ps -a
docker compose logs -f service-name
docker inspect container-name

# Execute commands in running containers
docker compose exec service-name sh
docker compose exec service-name env

# Check network connectivity
docker compose exec service-name ping other-service
docker compose exec service-name netstat -tulpn

# Review configuration
docker compose config
docker compose config --services
docker compose config --volumes

# Clean up resources
docker compose down -v
docker system prune -a --volumes
```

## Reference Project Structure

```sh
project/
├── compose.yaml              # Base configuration
├── compose.override.yaml     # Local overrides (auto-loaded)
├── compose.prod.yaml         # Production config
├── compose.staging.yaml      # Staging config
├── .env                      # Default environment
├── .env.prod                 # Production environment
├── services/
│   ├── frontend/
│   │   ├── Dockerfile
│   │   └── src/
│   ├── backend/
│   │   ├── Dockerfile
│   │   └── src/
│   └── worker/
│       ├── Dockerfile
│       └── src/
└── docker/
    ├── nginx/
    │   └── nginx.conf
    └── scripts/
        └── init.sql
```

## Resources

- Docker Compose Documentation: <https://docs.docker.com/compose/>
- Compose File Specification: <https://docs.docker.com/compose/compose-file/>
- Docker Hub: <https://hub.docker.com/>
- Awesome Compose Examples: <https://github.com/docker/awesome-compose>
- Docker Compose GitHub: <https://github.com/docker/compose>
- Best Practices Guide: <https://docs.docker.com/develop/dev-best-practices/>
