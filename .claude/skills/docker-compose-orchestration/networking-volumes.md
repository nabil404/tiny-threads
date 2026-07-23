# Networking, Volumes, and Health Checks

## Networking Strategies

### Default Bridge Network

```yaml
services:
  web:
    image: nginx
    # Automatically connected to default network

  app:
    image: myapp
    # Can communicate with 'web' via service name
```

### Custom Bridge Networks

```yaml
version: "3.8"

services:
  frontend:
    image: react-app
    networks:
      - public

  backend:
    image: api-server
    networks:
      - public    # Accessible from frontend
      - private   # Accessible from database

  database:
    image: postgres
    networks:
      - private   # Isolated from frontend

networks:
  public:
    driver: bridge
  private:
    driver: bridge
    internal: true  # No internet access
```

### Network Aliases

```yaml
services:
  api:
    image: api-server
    networks:
      backend:
        aliases:
          - api-server
          - api.internal
          - api-v1.internal

networks:
  backend:
    driver: bridge
```

### Host Network Mode

```yaml
services:
  app:
    image: myapp
    network_mode: "host"  # Use host network stack
    # No port mapping needed, uses host ports directly
```

### Custom Network Configuration

```yaml
networks:
  custom-network:
    driver: bridge
    driver_opts:
      com.docker.network.bridge.name: br-custom
    ipam:
      driver: default
      config:
        - subnet: 172.28.0.0/16
          gateway: 172.28.0.1
    labels:
      - "com.example.description=Custom network"
```

## Volume Management

### Named Volumes

```yaml
version: "3.8"

services:
  db:
    image: postgres:15
    volumes:
      - postgres-data:/var/lib/postgresql/data  # Named volume

  backup:
    image: postgres:15
    volumes:
      - postgres-data:/backup:ro  # Read-only mount
    command: pg_dump -U postgres > /backup/dump.sql

volumes:
  postgres-data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /path/on/host
```

### Bind Mounts

```yaml
services:
  web:
    image: nginx
    volumes:
      # Relative path bind mount
      - ./html:/usr/share/nginx/html

      # Absolute path bind mount
      - /var/log/nginx:/var/log/nginx

      # Read-only bind mount
      - ./config/nginx.conf:/etc/nginx/nginx.conf:ro
```

### tmpfs Mounts (In-Memory)

```yaml
services:
  app:
    image: myapp
    tmpfs:
      - /tmp
      - /run
    # Or with options:
    volumes:
      - type: tmpfs
        target: /app/cache
        tmpfs:
          size: 1000000000  # 1GB
```

### Volume Sharing Between Services

```yaml
services:
  app:
    image: myapp
    volumes:
      - shared-data:/data

  worker:
    image: worker
    volumes:
      - shared-data:/data

  backup:
    image: backup-tool
    volumes:
      - shared-data:/backup:ro

volumes:
  shared-data:
```

### Advanced Volume Configuration

```yaml
volumes:
  data:
    driver: local
    driver_opts:
      type: "nfs"
      o: "addr=10.40.0.199,nolock,soft,rw"
      device: ":/docker/example"

  cache:
    driver: local
    driver_opts:
      type: tmpfs
      device: tmpfs
      o: "size=100m,uid=1000"

  external-volume:
    external: true  # Volume created outside Compose
    name: my-existing-volume
```

## Health Checks

### HTTP Health Check

```yaml
services:
  web:
    image: nginx
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

### Database Health Checks

```yaml
services:
  postgres:
    image: postgres:15
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

  mysql:
    image: mysql:8
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 3

  mongodb:
    image: mongo:6
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5
```

### Application Health Checks

```yaml
services:
  app:
    build: ./app
    healthcheck:
      test: ["CMD", "node", "healthcheck.js"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s

  api:
    build: ./api
    healthcheck:
      test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### Complex Health Checks

```yaml
services:
  redis:
    image: redis:alpine
    healthcheck:
      test: |
        sh -c '
        redis-cli ping | grep PONG &&
        redis-cli --raw incr ping | grep 1
        '
      interval: 10s
      timeout: 3s
      retries: 5
```

### Waiting on Dependencies

```yaml
services:
  web:
    image: nginx
    depends_on:
      db:
        condition: service_healthy  # Wait for health check
      redis:
        condition: service_started  # Wait for start only

  db:
    image: postgres:15
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

  redis:
    image: redis:alpine
```
