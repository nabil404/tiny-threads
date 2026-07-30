# GEMINI.md

This file provides guidance to Gemini / Antigravity AI agents working in this repository.

---

## 1. Overview

**Tiny Threads** is a multi-tenant e-commerce marketplace platform (supporting dozens of merchant tenants, each selling to their own customers) built as a `pnpm` monorepo:

- **`apps/api`**: NestJS 11 backend providing core APIs, authentication (incl. merchant-admin RBAC), multi-tenant DB foundation, RLS policies, and domain services. The first commerce domain module — products and categories (storefront read endpoints, merchant-admin CRUD) — has shipped; orders, payments, and the rest of the commerce domain don't exist yet.
- **`apps/web`**: Next.js 16 (App Router) frontend for storefronts and administration.
- **`packages/shared`**: Shared TypeScript code used across `api` and `web`. Currently just the error-envelope types (`src/errors/` — `ErrorCode` enum, `ErrorResponseBody`/`FieldError`), kept here so neither app can drift from the other.
- **`docs/`**: Architectural Decision Records (ADRs), database schema/ERD specifications, and feature design docs.
- **`.agents/skills/`**: Domain-specific guidance for backend engineering, Docker Compose orchestration, multi-stage Dockerfiles, and REST API design.

---

## 2. Tech Stack

- **Runtime & Package Manager**: Node.js (`>=22`), `pnpm` workspaces
- **Backend Framework**: NestJS 11, TypeORM, Express, Passport (JWT, Local, Google OAuth 2.0), Argon2, `nestjs-cls` (AsyncLocalStorage-based tenant context propagation)
- **Database**: PostgreSQL 16 with Row-Level Security (RLS) enabled
- **Frontend Framework**: Next.js 16 (App Router), React 19, Tailwind CSS 4
- **Testing & Tooling**: Jest, Supertest, ESLint, Prettier, Docker Compose

---

## 3. Project Structure

```sh
tiny-threads/
├── .agents/skills/          # Repository skills (backend-engineer, rest-api-design, etc.)
├── apps/
│   ├── api/                 # NestJS backend
│   │   ├── src/
│   │   │   ├── app/         # Root module, app controller/service, tenant-resolution wiring
│   │   │   ├── auth-core/   # Shared auth primitives: hashing, tokens, OAuth state, coded JWT/local guards
│   │   │   ├── common/      # Coded exceptions + global exception filter, tenant-resolution middleware, shared utils
│   │   │   ├── config/      # Environment & app configuration
│   │   │   ├── customers/   # Customer authentication & profile management
│   │   │   ├── db/          # RLS tenancy foundation, entities, migrations, DataSource
│   │   │   ├── merchant-admins/ # Merchant admin authentication & user management
│   │   │   ├── notifications/ # Notification domain module & provider interfaces
│   │   │   ├── oauth/       # Centralized Google OAuth callback & one-time-code exchange
│   │   │   ├── products/    # Products + categories: storefront read endpoints, merchant-admin CRUD
│   │   │   ├── bootstrap.ts # configureApp(): global pipes/filters/prefix/versioning, called from main.ts
│   │   ├── test/            # Integration & E2E tests, Jest setup scripts
│   │   └── scripts/         # DB migration wrapper scripts
│   └── web/                 # Next.js frontend application
├── docker/                  # PostgreSQL initialization scripts and roles
├── docs/
│   ├── architecture/        # Architecture decisions & database ERD/schema docs
│   ├── design/              # Authentication & error-handling as-built references
│   └── AuthDesign.md        # Pre-implementation auth spec; authentication.md notes where it diverged
├── packages/
│   └── shared/              # Shared TS package (@tiny-threads/shared)
├── docker-compose.yml       # Dev database container configuration
├── docker-compose.test.yml  # Isolated test database container configuration
├── pnpm-workspace.yaml      # Monorepo workspace configuration
└── package.json             # Root workspace scripts & dev dependencies
```

---

## 4. Tenancy & Database Architecture

The core backend architecture relies on a **pooled shared schema** model with strict tenant isolation enforced at the PostgreSQL database level using **Row-Level Security (RLS)**.

### Database Roles

Both roles are created `NOSUPERUSER NOBYPASSRLS` (`docker/postgres/init/01-roles.sh`) — isolation is not an artifact of a privileged connection:

1. **`app_owner`**: owns the schema/tables, used exclusively by migrations (`data-source.ts`) to run DDL. Does **not** bypass RLS.
2. **`app_runtime`**: the app's only DB connection (`database.module.ts`), granted `SELECT/INSERT/UPDATE/DELETE` via default privileges. Fully subject to RLS `FORCE`.

> ⚠️ **CRITICAL SECURITY RULE**: Never point the application's runtime `DATABASE_URL` to `app_owner`.

### Tenancy Isolation (`TenantDbService`)

- Tenant-scoped tables include a `tenant_id` column protected by PostgreSQL RLS (`ENABLE` + `FORCE`).
- All tenant queries MUST run through `TenantDbService.run(...)` (or `withTenant(...)`), which sets the tenant via a **parameterized** `set_config('app.current_tenant', <id>, true)` inside a transaction — never a bare `SET`/`SET LOCAL` with the id string-interpolated, which would be an injection footgun.
- **`TenantResolutionMiddleware`** (`apps/api/src/common/middleware/tenant-resolution.middleware.ts`) is the **only** thing that populates the CLS tenant context `withTenant` reads — it resolves the tenant by an exact match of the request hostname against `tenants.host`, 404s on no match. Mounted on every route except two documented exceptions (the Google OAuth callback, the liveness route) — see decision D2a in `docs/architecture/architecture.md` before adding another exclusion.
- Never inject `DataSource` or `EntityManager` directly for tenant-scoped operations.
- Application code alone must never be relied upon to filter by tenant—RLS must enforce context.

### Base Entity Classes (`apps/api/src/db/entities/base/`)

- `TenantEntityBase`: Primary key (`uuidv7`), `tenant_id`, `created_at`, `updated_at`.
- `ImmutableTenantEntityBase`: Primary key (`uuidv7`), `tenant_id`, `created_at` (read-only/append-only tables).
- `EntityBase`: Non-tenant shared entities (e.g. global tenant records).
- `ImmutableEntityBase`: Non-tenant append-only entities.
- `CreatedAtEntityBase`: Simple non-tenant timestamped entities.

---

## 5. Development Workflows & Commands

### Prerequisites & Setup

1. Copy `.env.example` to `.env` for local development.
2. Copy `.env.test.example` to `.env.test` for testing.
3. Boot the local development Postgres instance:

   ```bash
   docker compose up -d
   ```

### Running Applications

```bash
pnpm dev:api     # Start NestJS API in watch mode (@tiny-threads/api)
pnpm dev:web     # Start Next.js web application in dev mode (@tiny-threads/web)
```

### Build & Code Quality

```bash
pnpm build       # Build all workspace packages and apps
pnpm lint        # Run ESLint across all projects
pnpm format      # Format codebase using Prettier
```

### Database Management & Migrations

```bash
pnpm db:generate <MigrationName>   # Generate a TypeORM migration from entity changes
pnpm db:migrate                    # Execute pending migrations and run verify-rls
pnpm db:revert                     # Revert the most recently executed migration
pnpm --filter @tiny-threads/api db:verify-rls   # Verify RLS policies on all tenant tables
```

### Testing

Tests run against an isolated Postgres test database (`postgres-test` on port 5433 booted via `docker-compose.test.yml`).

```bash
# Unit & integration tests
pnpm test                          # Run unit tests in apps/api
pnpm test:watch                    # Run Jest in watch mode
pnpm test:cov                      # Generate test coverage report
pnpm test -- <pattern>             # Run specific tests (e.g., pnpm test -- auth)

# End-to-end (E2E) tests
pnpm test:e2e                      # Run E2E test suite in apps/api
```

---

## 6. Coding Conventions & Best Practices

1. **Tenancy Isolation**:
   Always execute tenant queries through `TenantDbService.run(...)`. Consult `.agents/skills/backend-engineer/SKILL.md` before making database or entity changes.

2. **Vendor Abstraction (Ports & Adapters)**:
   Integrations with third-party providers (payment gateways, shipping, tax, notifications, storage, search) must be hidden behind domain ports. Vendor SDK types or classes must never leak into domain services or controllers.

3. **REST API Design**:
   Follow conventions in `.agents/skills/rest-api-design/SKILL.md`:
   - Plural nouns for resource endpoints (e.g., the existing `/api/v1/customers/auth`, `/api/v1/merchant-admins/auth` — the `api/v1` prefix comes from `app.setGlobalPrefix()` + `enableVersioning()` in `bootstrap.ts`, sourced from `API_PREFIX`/`API_VERSION` in `common/constants.ts`).
   - Explicit HTTP status codes (`200 OK`, `201 Created`, `204 No Content`, `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`).
   - OpenAPI documentation using `@nestjs/swagger` decorators.

4. **Error Handling**:
   Throw a `Coded*Exception` (`apps/api/src/common/errors/`, e.g. `CodedUnauthorizedException`, `CodedNotFoundException`) with an `ErrorCode` from `packages/shared`, never a bare `HttpException` — the global `AllExceptionsFilter` is the only place that produces a response body, as `{ error: { code, message, params } }` (plus a `fields` map for validation errors). See `docs/design/error-handling.md`.

5. **Merchant-Admin RBAC**:
   Guard merchant-admin-scoped endpoints with `@Roles(...)` (`apps/api/src/merchant-admins/decorators/roles.decorator.ts`) + `RolesGuard` (`apps/api/src/merchant-admins/guards/roles.guard.ts`); rank checks (e.g. an `admin` inviting an `owner`) go through `roleOutranks()` in `apps/api/src/merchant-admins/utils/role-hierarchy.ts`. Not a separate module — other modules with merchant-admin routes (e.g. `products`) import it from `merchant-admins/`.

6. **Code Style & Formatting**:
   - Single quotes, trailing commas (`.prettierrc`).
   - Scoped package names (`@tiny-threads/api`, `@tiny-threads/web`, `@tiny-threads/shared`).
   - Avoid `any` types; prefer strict TypeScript interfaces and DTOs with `class-validator`.

---

## 7. Essential References

- **Backend Operating Manual**: `.agents/skills/backend-engineer/SKILL.md`
- **REST API Guidelines**: `.agents/skills/rest-api-design/SKILL.md`
- **Architecture Rationale**: `docs/architecture/architecture.md`
- **Database ERD & Schema Spec**: `docs/architecture/database-schema.md`
- **Authentication Design**: `docs/design/authentication.md` (`docs/AuthDesign.md` is the earlier pre-implementation spec)
- **Error-Handling Design**: `docs/design/error-handling.md`
