# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 1. Overview

Tiny Threads is a **multi-tenant e-commerce marketplace** backend (dozens of merchant tenants, each selling to their own customers) plus a Next.js storefront/admin frontend. It's a pnpm monorepo:

- **`apps/api`** — NestJS backend, the substantive app. What's built so far: the tenancy/DB foundation, auth end-to-end (customer + merchant-admin password auth, Google OAuth, JWT refresh rotation, role-based access control for merchant admins), a coded error-envelope system every response goes through, the first provider port (notifications), and the first commerce domain module — products and categories (storefront read endpoints, merchant-admin CRUD). Orders, payments, and the rest of the commerce domain don't exist yet.
- **`apps/web`** — Next.js 16 (App Router) frontend. Currently a fresh `create-next-app` scaffold — no storefront/admin UI yet.
- **`packages/shared`** — shared TypeScript code between `api` and `web`. Currently just the error-envelope types (`src/errors/` — `ErrorCode` enum, `ErrorResponseBody`/`FieldError`), kept here so neither app can drift from the other.

**Read `.claude/skills/backend-engineer/SKILL.md` before touching any backend code** — it is the operating manual (the *how*: tenancy rules, ORM conventions, provider ports, order state machine) that `docs/architecture/architecture.md` is the decision record (the *why*) for. It's invoked automatically for backend work, but skim it directly for the full detail up front. Two areas in it are marked ⚠️ because getting them wrong is a data breach or vendor lock-in, not a style nit:

1. **Tenancy isolation** — pooled shared schema, `tenant_id` on every tenant-scoped table, enforced by PostgreSQL RLS (`FORCE` + policy), tenant context set transaction-locally through one central `withTenant` gate. Never filter by tenant in application code alone.
2. **Vendor-agnostic providers** — payments, shipping, tax, notifications, storage, and search are each a domain-owned port with adapters at the edge. No vendor SDK/type may appear outside its adapter.

When either of these change, update `docs/architecture/architecture.md` **and** the corresponding rule in the skill in the same change.

## 2. Tech Stack

- **Runtime & package manager:** Node.js `>=22`, pnpm workspaces (`apps/*`, `packages/*`).
- **Backend:** NestJS 11, TypeORM, Passport (JWT, Local, Google OAuth 2.0), Argon2, `nestjs-cls` (AsyncLocalStorage for tenant context).
- **Database:** PostgreSQL 16, tenancy enforced by Row-Level Security.
- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS 4.
- **Testing & tooling:** Jest, Supertest, ESLint (flat config), Prettier, Docker Compose.

## 3. Project Structure

```sh
tiny-threads/
├── apps/
│   ├── api/                        # NestJS backend
│   │   ├── src/
│   │   │   ├── app/                # Root module, app controller/service, tenant-resolution wiring
│   │   │   ├── auth-core/          # Shared auth primitives: hashing, tokens, OAuth state, coded JWT/local guards
│   │   │   ├── common/             # Coded exceptions + global filter, tenant-resolution middleware, shared utils
│   │   │   ├── config/             # Env validation
│   │   │   ├── customers/          # Customer password auth (controller/service/DTOs/guards/strategies)
│   │   │   ├── db/                 # Tenancy/RLS foundation — see section 4
│   │   │   ├── merchant-admins/    # Merchant-admin password auth (same shape as customers/)
│   │   │   ├── notifications/      # NotificationsPort + LogNotificationsAdapter (first provider port)
│   │   │   ├── oauth/              # Centralized Google OAuth callback, one-time-code exchange
│   │   │   ├── products/           # Products + categories: storefront read endpoints, merchant-admin CRUD
│   │   │   ├── bootstrap.ts        # configureApp() — global pipes/filters, called from main.ts
│   │   │   └── main.ts
│   │   ├── test/                   # e2e specs + Jest setup (setup-unit.ts / setup-e2e.ts)
│   │   └── scripts/                # db-generate.sh / db-migrate.sh wrappers (see section 5)
│   └── web/                        # Next.js frontend (fresh scaffold, App Router)
├── docs/
│   ├── architecture/               # architecture.md (decision record) + database-schema.md (ERD) + references/
│   ├── design/                     # authentication.md, error-handling.md (as-built references)
│   └── AuthDesign.md               # pre-implementation auth spec; authentication.md notes where it diverged
├── docker/postgres/init/           # app_owner / app_runtime role bootstrap (see section 4)
├── packages/shared/                # @tiny-threads/shared — error-envelope types today
├── docker-compose.yml              # dev Postgres
├── docker-compose.test.yml         # isolated test Postgres (port 5433)
└── .claude/skills/                 # backend-engineer, rest-api-design, docker-compose-orchestration, multi-stage-dockerfile
```

## 4. Tenancy & Database Architecture

`apps/api/src/db/` implements the tenancy model; full rationale lives in `docs/architecture/architecture.md` (decisions D1/D2/D2a).

**Database roles** (`docker/postgres/init/01-roles.sh`) — both `NOSUPERUSER NOBYPASSRLS`, so isolation isn't an artifact of a privileged connection:

1. **`app_owner`** — owns the schema/tables, used only by migrations (`data-source.ts`). Never point the app's runtime `DATABASE_URL` at it.
2. **`app_runtime`** — the app's only DB connection (`database.module.ts`), granted `SELECT/INSERT/UPDATE/DELETE` via default privileges, fully subject to RLS `FORCE`.

**Tenant context — the `withTenant` gate:**

- `tenant-db.ts` / `tenant-db.service.ts` — `withTenant(...)` is the **only** place tenant context is set: `set_config('app.current_tenant', ..., true)` inside a transaction, never a bare `SET` or string interpolation. All tenant-scoped queries go through `TenantDbService.run(...)` — never inject `DataSource`/`EntityManager` directly for tenant-scoped tables.
- `src/common/middleware/tenant-resolution.middleware.ts` — the **only** thing that populates the CLS tenant context `withTenant` reads. Resolves the tenant by an exact match of the request hostname against `tenants.host`, 404s on no match. Mounted on every route except two documented exceptions (the Google OAuth callback, the liveness route) — see D2a in `docs/architecture/architecture.md` before adding another exclusion.

**RLS tooling:**

- `migrations/helpers/rls.helper.ts` — shared `enableRls`/`disableRls` helpers, called from every tenant-table migration's `up()`/`down()` adjacent to that table's `CREATE`/`DROP TABLE`.
- `verify-rls.ts` — checks every tenant-scoped table has RLS `ENABLE`d + `FORCE`d + a policy; `pnpm db:migrate` runs it automatically and auto-reverts on failure.

**Entities:**

- `entities/base/` — abstract base classes (`TenantEntityBase`, `ImmutableTenantEntityBase`, `EntityBase`, `ImmutableEntityBase`, `CreatedAtEntityBase`) every entity extends for its PK/timestamp columns; see "Base entity classes" in `.claude/skills/backend-engineer/SKILL.md`.

`database.module.ts` connects only as `app_runtime`, with `synchronize`/`migrationsRun` permanently off — schema changes only happen through the CLI as `app_owner`.

## 5. Development Workflows & Commands

**Setup:**

```bash
pnpm install
cp .env.example .env             # fill in passwords, then: docker compose up -d
cp .env.test.example .env.test   # self-contained, no dependency on the root .env
```

**Run:**

```bash
pnpm dev:api     # NestJS, watch mode
pnpm dev:web     # Next.js dev server
```

**Build / lint / format (repo root):**

```bash
pnpm build       # pnpm -r build
pnpm lint        # pnpm -r lint
pnpm format      # prettier --write across apps/ and packages/
```

**Database migrations** (root or `apps/api`):

```bash
pnpm db:generate <MigrationName>   # generate a migration from entity diffs (wraps typeorm CLI)
pnpm db:migrate                    # run pending migrations, then verify RLS; auto-reverts the run if verification fails
pnpm db:revert                     # revert the last migration
pnpm --filter @tiny-threads/api db:verify-rls   # run the RLS check standalone
```

Local Postgres runs via `docker-compose.yml` (`postgres:16-alpine`, port 5432, healthcheck-gated).

**Testing** (inside `apps/api`) — always against the **separate** test Postgres, never the dev one:

```bash
pnpm test              # jest unit tests
pnpm test:watch
pnpm test:cov
pnpm test -- <name>    # run a single test file/pattern, e.g. pnpm test -- app.controller
pnpm test:e2e          # jest -c test/jest-e2e.json
```

`docker-compose.test.yml` adds a `postgres-test` service (port 5433, its own volume, same roles as dev). `pretest`/`pretest:e2e` hooks auto-start that container and migrate it — no manual setup needed beyond the one-time `.env.test` copy.

`apps/web` has no test runner configured yet; use `pnpm --filter @tiny-threads/web lint` for lint-only checks.

## 6. Coding Conventions & Best Practices

- **Tenancy isolation:** always execute tenant queries through `TenantDbService.run(...)` / `withTenant`. Consult `.claude/skills/backend-engineer/SKILL.md` before making database or entity changes.
- **Vendor abstraction (ports & adapters):** integrations with third-party providers (payment gateways, shipping, tax, notifications, storage, search) must be hidden behind domain ports. Vendor SDK types must never leak into domain services or controllers.
- **Error handling:** throw a `Coded*Exception` (`src/common/errors/`) with an `ErrorCode` from `packages/shared`, never a bare `HttpException`; the global `AllExceptionsFilter` is the only place a response body is produced. See `docs/design/error-handling.md`.
- **Merchant-admin RBAC:** guard merchant-admin-scoped endpoints with `@Roles(...)` (`merchant-admins/decorators/roles.decorator.ts`) + `RolesGuard` (`merchant-admins/guards/roles.guard.ts`); rank checks (e.g. an `admin` inviting an `owner`) go through `roleOutranks()` in `merchant-admins/utils/role-hierarchy.ts`. This isn't a separate module — other modules with merchant-admin routes (e.g. `products`) import it from `merchant-admins/`.
- **REST API design:** follow `.claude/skills/rest-api-design/SKILL.md` for resource naming, HTTP methods/status codes, versioning, pagination, and OpenAPI docs.
- **Formatting:** single quotes, trailing commas everywhere (`.prettierrc` at repo root; enforced through ESLint's `prettier/prettier` rule, not a separate check).
- **Linting:** `apps/api` ESLint runs with `recommendedTypeChecked`; `@typescript-eslint/no-explicit-any` is off, `no-floating-promises`/`no-unsafe-argument` are warnings not errors.
- **Package names** are scoped: `@tiny-threads/api`, `@tiny-threads/web`, `@tiny-threads/shared`.

## 7. Essential References

- **Backend operating manual:** `.claude/skills/backend-engineer/SKILL.md`
- **REST API guidelines:** `.claude/skills/rest-api-design/SKILL.md`
- **Architecture Rationale**: `docs/architecture/architecture.md`
- **Database ERD & Schema Spec**: `docs/architecture/database-schema.md`
- **Authentication Design**: `docs/architecture/authentication.md`
- **Error-Handling Design**: `docs/architecture/error-handling.md`
- **Products & Categories**: `docs/architecture/products-and-categories.md`
- **Carts & Customer Addresses**: `docs/architecture/carts-and-addresses.md`
- **Orders**: `docs/architecture/orders.md`
- **Payments**: `docs/architecture/payments.md`
- **Database Conventions**: `docs/architecture/database-conventions.md`
