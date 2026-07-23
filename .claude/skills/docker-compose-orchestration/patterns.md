# Multi-Container Application Patterns

Full compose examples for common architectures. Adapt service names, ports, and images to your project.

## Pattern 1: Full-Stack Web Application

**Scenario:** React frontend + Node.js backend + PostgreSQL database + Redis cache

```yaml
version: "3.8"

services:
  # Frontend React Application
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      target: development
    ports:
      - "3000:3000"
    volumes:
      - ./frontend/src:/app/src
      - /app/node_modules
    environment:
      - REACT_APP_API_URL=http://localhost:4000/api
      - CHOKIDAR_USEPOLLING=true  # For hot reload
    networks:
      - frontend
    depends_on:
      - backend

  # Backend Node.js API
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "4000:4000"
      - "9229:9229"  # Debugger
    volumes:
      - ./backend:/app
      - /app/node_modules
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://postgres:password@db:5432/myapp
      - REDIS_URL=redis://cache:6379
      - JWT_SECRET=dev-secret
    env_file:
      - ./backend/.env.local
    networks:
      - frontend
      - backend
    depends_on:
      db:
        condition: service_healthy
      cache:
        condition: service_started
    command: npm run dev

  # PostgreSQL Database
  db:
    image: postgres:15-alpine
    container_name: postgres-db
    restart: unless-stopped
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=myapp
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./database/init.sql:/docker-entrypoint-initdb.d/init.sql
    networks:
      - backend
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Redis Cache
  cache:
    image: redis:7-alpine
    container_name: redis-cache
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    networks:
      - backend
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge

volumes:
  postgres-data:
    driver: local
  redis-data:
    driver: local
```

## Pattern 2: Microservices Architecture

**Scenario:** Multiple services with reverse proxy, service discovery, and a message broker

```yaml
version: "3.8"

services:
  # NGINX Reverse Proxy
  proxy:
    image: nginx:alpine
    container_name: reverse-proxy
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - ./ssl:/etc/nginx/ssl:ro
    networks:
      - public
    depends_on:
      - auth-service
      - user-service
      - order-service
    restart: unless-stopped

  # Authentication Service
  auth-service:
    build: ./services/auth
    container_name: auth-service
    expose:
      - "8001"
    environment:
      - SERVICE_NAME=auth
      - DATABASE_URL=postgresql://db:5432/auth_db
      - JWT_SECRET=${JWT_SECRET}
    networks:
      - public
      - internal
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8001/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # User Service
  user-service:
    build: ./services/user
    container_name: user-service
    expose:
      - "8002"
    environment:
      - SERVICE_NAME=user
      - DATABASE_URL=postgresql://db:5432/user_db
      - AUTH_SERVICE_URL=http://auth-service:8001
    networks:
      - public
      - internal
    depends_on:
      - auth-service
      - db
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8002/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Order Service
  order-service:
    build: ./services/order
    container_name: order-service
    expose:
      - "8003"
    environment:
      - SERVICE_NAME=order
      - DATABASE_URL=postgresql://db:5432/order_db
      - USER_SERVICE_URL=http://user-service:8002
      - RABBITMQ_URL=amqp://rabbitmq:5672
    networks:
      - public
      - internal
    depends_on:
      - user-service
      - db
      - rabbitmq
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8003/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Shared PostgreSQL Database
  db:
    image: postgres:15-alpine
    container_name: postgres-db
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./database/init-multi-db.sql:/docker-entrypoint-initdb.d/init.sql
    networks:
      - internal
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  # RabbitMQ Message Broker
  rabbitmq:
    image: rabbitmq:3-management-alpine
    container_name: rabbitmq
    ports:
      - "5672:5672"   # AMQP
      - "15672:15672" # Management UI
    environment:
      - RABBITMQ_DEFAULT_USER=admin
      - RABBITMQ_DEFAULT_PASS=${RABBITMQ_PASSWORD}
    volumes:
      - rabbitmq-data:/var/lib/rabbitmq
    networks:
      - internal
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "ping"]
      interval: 30s
      timeout: 10s
      retries: 5

networks:
  public:
    driver: bridge
  internal:
    driver: bridge
    internal: true  # No external access

volumes:
  postgres-data:
  rabbitmq-data:
```

## Pattern 3: Development Environment with Hot Reload

**Scenario:** Development setup with live code reloading, debugging, and supporting tools (pgAdmin, MailHog)

```yaml
version: "3.8"

services:
  # Development Frontend
  frontend-dev:
    build:
      context: ./frontend
      dockerfile: Dockerfile.dev
    ports:
      - "3000:3000"
      - "9222:9222"  # Chrome DevTools
    volumes:
      - ./frontend:/app
      - /app/node_modules
      - /app/.next  # Next.js build cache
    environment:
      - NODE_ENV=development
      - WATCHPACK_POLLING=true
      - NEXT_PUBLIC_API_URL=http://localhost:4000
    networks:
      - dev-network
    stdin_open: true
    tty: true
    command: npm run dev

  # Development Backend
  backend-dev:
    build:
      context: ./backend
      dockerfile: Dockerfile.dev
    ports:
      - "4000:4000"
      - "9229:9229"  # Node.js debugger
    volumes:
      - ./backend:/app
      - /app/node_modules
    environment:
      - NODE_ENV=development
      - DEBUG=app:*
      - DATABASE_URL=postgresql://postgres:dev@db:5432/dev_db
    networks:
      - dev-network
    depends_on:
      - db
      - mailhog
    command: npm run dev:debug

  # PostgreSQL with pgAdmin
  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_PASSWORD=dev
      - POSTGRES_DB=dev_db
    ports:
      - "5432:5432"
    volumes:
      - dev-db-data:/var/lib/postgresql/data
    networks:
      - dev-network

  pgadmin:
    image: dpage/pgadmin4:latest
    environment:
      - PGADMIN_DEFAULT_EMAIL=admin@dev.local
      - PGADMIN_DEFAULT_PASSWORD=admin
    ports:
      - "5050:80"
    networks:
      - dev-network
    depends_on:
      - db

  # MailHog for Email Testing
  mailhog:
    image: mailhog/mailhog:latest
    ports:
      - "1025:1025"  # SMTP
      - "8025:8025"  # Web UI
    networks:
      - dev-network

networks:
  dev-network:
    driver: bridge

volumes:
  dev-db-data:
```

## Development vs Production Configurations

Split configuration across files and merge them with `-f` flags (see commands.md).

### Base Configuration (compose.yaml)

```yaml
version: "3.8"

services:
  web:
    image: myapp:latest
    environment:
      - NODE_ENV=production
    networks:
      - app-network

  db:
    image: postgres:15-alpine
    networks:
      - app-network

networks:
  app-network:
    driver: bridge
```

### Development Override (compose.override.yaml)

Automatically merged with `compose.yaml` when running `docker compose up` with no `-f` flags.

```yaml
version: "3.8"

services:
  web:
    build:
      context: .
      target: development
    volumes:
      - ./src:/app/src  # Live code reload
      - /app/node_modules
    ports:
      - "3000:3000"     # Expose for local access
      - "9229:9229"     # Debugger port
    environment:
      - NODE_ENV=development
      - DEBUG=*
    command: npm run dev

  db:
    ports:
      - "5432:5432"     # Expose for local tools
    environment:
      - POSTGRES_PASSWORD=dev
    volumes:
      - ./init-dev.sql:/docker-entrypoint-initdb.d/init.sql
```

### Production Configuration (compose.prod.yaml)

```yaml
version: "3.8"

services:
  web:
    image: myapp:${VERSION:-latest}
    restart: always
    environment:
      - NODE_ENV=production
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
      update_config:
        parallelism: 1
        delay: 10s
        failure_action: rollback
      rollback_config:
        parallelism: 1
        delay: 5s
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "5"

  db:
    image: postgres:15-alpine
    restart: always
    environment:
      - POSTGRES_PASSWORD_FILE=/run/secrets/db_password
    secrets:
      - db_password
    volumes:
      - postgres-data:/var/lib/postgresql/data
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G

  # Production additions
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/prod.conf:/etc/nginx/nginx.conf:ro
      - ssl-certs:/etc/nginx/ssl:ro
    restart: always
    depends_on:
      - web

secrets:
  db_password:
    external: true

volumes:
  postgres-data:
    driver: local
  ssl-certs:
    external: true
```

### Staging Configuration (compose.staging.yaml)

```yaml
version: "3.8"

services:
  web:
    image: myapp:staging-${VERSION:-latest}
    restart: unless-stopped
    environment:
      - NODE_ENV=staging
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '1'
          memory: 1G

  db:
    environment:
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - staging-db-data:/var/lib/postgresql/data

volumes:
  staging-db-data:
```
