# GEMINI.md — Backend API (`apps/api`)

This file provides guidance to Gemini / Antigravity AI agents working in `apps/api`.

---

## 1. Overview

**`apps/api`** is the NestJS 11 backend providing core APIs, authentication (customer & merchant-admin), multi-tenant DB foundation with PostgreSQL Row-Level Security (RLS), error handling envelopes, provider ports, and domain services for the **Tiny Threads** multi-tenant e-commerce platform.

**Read `.agents/skills/backend-engineer/SKILL.md` before touching any backend code** — it is the operating manual (the *how*: tenancy rules, ORM conventions, provider ports, order state machine) that `docs/architecture/architecture.md` is the decision record (the *why*) for. Two critical rules:

1. **Tenancy isolation** — pooled shared schema, `tenant_id` on every tenant-scoped table, enforced by PostgreSQL RLS (`FORCE` + policy), tenant context set transaction-locally through `withTenant`. Never filter by tenant in application code alone.
2. **Vendor-agnostic providers** — payments, shipping, tax, notifications, storage, and search are each a domain-owned port with adapters at the edge. No vendor SDK/type may appear outside its adapter.

---

## 2. Tech Stack

- **Runtime**: Node.js (`>=22`), `pnpm` workspaces
- **Framework**: NestJS 11, TypeORM, Express, Passport (JWT, Local, Google OAuth 2.0), Argon2, `nestjs-cls` (AsyncLocalStorage for tenant context)
- **Database**: PostgreSQL 16 with Row-Level Security (RLS) enabled
- **Testing & Tooling**: Jest, Supertest, ESLint (flat config with `recommendedTypeChecked`), Prettier, Docker Compose

---

## 3. Project Structure

```sh
apps/api/
├── src/
│   ├── app/                # Root module, app controller/service, tenant-resolution wiring
│   ├── auth-core/          # Shared auth primitives: hashing, tokens, OAuth state, coded JWT/local guards
│   ├── common/             # Coded exceptions + global exception filter, tenant-resolution middleware, shared utils
│   ├── config/             # Environment validation & app configuration
│   ├── customers/          # Customer authentication & profile management
│   ├── db/                 # RLS tenancy foundation, entities, migrations, DataSource
│   ├── merchant-admins/    # Merchant admin authentication & user management (incl. RBAC)
│   ├── notifications/      # Notifications domain port & provider adapters
│   ├── oauth/              # Centralized Google OAuth callback & one-time-code exchange
│   ├── products/           # Products + categories (storefront read, merchant-admin CRUD)
│   ├── bootstrap.ts        # configureApp(): global pipes/filters/prefix/versioning
│   └── main.ts             # Application entry point
├── test/                   # Integration & E2E tests, Jest setup scripts
├── scripts/                # DB migration wrapper scripts
└── package.json            # Package configuration (@tiny-threads/api)
```

---

## 4. Tenancy & Database Architecture

`apps/api/src/db/` implements the tenancy model; full rationale lives in `docs/architecture/architecture.md`.

### Database Roles

Both roles are created `NOSUPERUSER NOBYPASSRLS` (`docker/postgres/init/01-roles.sh`) — isolation is not an artifact of a privileged connection:

1. **`app_owner`**: owns the schema/tables, used exclusively by migrations (`data-source.ts`) to run DDL. Does **not** bypass RLS.
2. **`app_runtime`**: the app's only DB connection (`database.module.ts`), granted `SELECT/INSERT/UPDATE/DELETE` via default privileges. Fully subject to RLS `FORCE`.

> ⚠️ **CRITICAL SECURITY RULE**: Never point the application's runtime `DATABASE_URL` to `app_owner`.

### Tenancy Isolation (`TenantDbService`)

- Tenant-scoped tables include a `tenant_id` column protected by PostgreSQL RLS (`ENABLE` + `FORCE`).
- All tenant queries MUST run through `TenantDbService.run(...)` (or `withTenant(...)`), which sets the tenant via a **parameterized** `set_config('app.current_tenant', <id>, true)` inside a transaction — never a bare `SET`/`SET LOCAL` with string interpolation.
- **`TenantResolutionMiddleware`** (`src/common/middleware/tenant-resolution.middleware.ts`) is the **only** thing that populates the CLS tenant context `withTenant` reads — it resolves the tenant by exact match of request hostname against `tenants.host`, 404s on no match.
- Never inject `DataSource` or `EntityManager` directly for tenant-scoped operations.

### RLS Tooling & Migrations

- `migrations/helpers/rls.helper.ts` — shared `enableRls`/`disableRls` helpers called from every tenant-table migration's `up()`/`down()`.
- `verify-rls.ts` — checks every tenant-scoped table has RLS `ENABLE`d + `FORCE`d + a policy; `pnpm db:migrate` runs it automatically and auto-reverts on failure.

### Base Entity Classes (`src/db/entities/base/`)

- `TenantEntityBase`: Primary key (`uuidv7`), `tenant_id`, `created_at`, `updated_at`.
- `ImmutableTenantEntityBase`: Primary key (`uuidv7`), `tenant_id`, `created_at` (read-only/append-only tables).
- `EntityBase`: Non-tenant shared entities (e.g. global tenant records).
- `ImmutableEntityBase`: Non-tenant append-only entities.
- `CreatedAtEntityBase`: Simple non-tenant timestamped entities.

---

## 5. Development Workflows & Commands

Commands can be run from `apps/api` or root workspace:

### Application Execution

```bash
pnpm dev             # Run NestJS API in watch mode (from apps/api)
# or from root:
pnpm dev:api
```

### Database Operations

```bash
pnpm db:generate <MigrationName>   # Generate TypeORM migration from entity changes
pnpm db:migrate                    # Execute pending migrations and run verify-rls
pnpm db:revert                     # Revert most recently executed migration
pnpm db:verify-rls                 # Verify RLS policies on all tenant tables
```

### Testing

Tests run against isolated test Postgres (`postgres-test` on port 5433 via `docker-compose.test.yml`).

```bash
pnpm test                          # Run unit/integration tests
pnpm test:watch                    # Run Jest in watch mode
pnpm test:cov                      # Generate test coverage report
pnpm test -- <pattern>             # Run specific test file (e.g., pnpm test -- products)
pnpm test:e2e                      # Run E2E test suite
```

---

## 6. Coding Conventions & Best Practices

1. **Tenancy Isolation**: Always execute tenant queries through `TenantDbService.run(...)`. Consult `.agents/skills/backend-engineer/SKILL.md` before making database or entity changes.
2. **Vendor Abstraction**: Third-party provider integrations must be hidden behind domain ports. Vendor SDK types must never leak into domain services or controllers.
3. **Error Handling**: Throw a `Coded*Exception` (`src/common/errors/`) with an `ErrorCode` from `@tiny-threads/shared`, never a bare `HttpException`. The global `AllExceptionsFilter` is the only place producing response bodies.
4. **Merchant-Admin RBAC**: Guard merchant-admin endpoints with `@Roles(...)` + `RolesGuard`; rank checks go through `roleOutranks()` in `merchant-admins/utils/role-hierarchy.ts`.
5. **REST API Design**: Follow conventions in `.agents/skills/rest-api-design/SKILL.md`: plural nouns for resources, explicit HTTP status codes, and OpenAPI documentation with `@nestjs/swagger`.
6. **Formatting & Types**: Single quotes, trailing commas (`.prettierrc`). Strict TypeScript interfaces and DTOs with `class-validator`.

---

## 7. Essential References

- **Backend Operating Manual**: `.agents/skills/backend-engineer/SKILL.md`
- **REST API Guidelines**: `.agents/skills/rest-api-design/SKILL.md`
- **Architecture Rationale**: `../../docs/architecture/architecture.md`
- **Database ERD & Schema Spec**: `../../docs/architecture/database-schema.md`
- **Authentication Design**: `../../docs/architecture/authentication.md`
- **Error-Handling Design**: `../../docs/architecture/error-handling.md`
- **Database Conventions**: `../../docs/architecture/database-conventions.md`
