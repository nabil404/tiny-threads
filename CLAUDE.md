# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Tiny Threads is a **multi-tenant e-commerce marketplace** backend (dozens of merchant tenants, each selling to their own customers) plus a Next.js storefront/admin frontend. It's a pnpm monorepo:

- `apps/api` — NestJS backend (the substantive app). Domain modules (products, orders, etc.) don't exist yet; what's built so far is the tenancy/DB foundation — see `apps/api/src/db/` below.
- `apps/web` — Next.js 16 (App Router) frontend. Currently a fresh `create-next-app` scaffold.
- `packages/shared` — shared TypeScript code between `api` and `web` (currently empty, just `src/index.ts`).
- `docs/architecture/architecture.md` — the decision record (the *why*) for the backend architecture, with full rationale per decision under `docs/architecture/references/`.
- `docs/architecture/database-schema.md` — the table/ERD companion to the architecture doc: tenancy scope per table, composite PK/FK conventions, and design decisions behind specific columns (price snapshots, settlements, category hierarchy, etc.).
- `docs/design/authentication.md` — as-built reference for the current authentication flow (customer + merchant-admin password auth, refresh rotation, the centralized Google OAuth callback), with flowcharts. `docs/AuthDesign.md` is the earlier pre-implementation spec; the design doc notes where the shipped system diverged from it.

**Read `.claude/skills/backend-engineer/SKILL.md` before touching any backend code** — it is the operating manual (the *how*: tenancy rules, ORM conventions, provider ports, order state machine) that `docs/architecture/architecture.md` is the record for. It is invoked automatically for backend work, but skim it directly if you want the full detail up front. Two areas in it are marked ⚠️ because getting them wrong is a data breach or vendor lock-in, not a style nit:

1. **Tenancy isolation** — pooled shared schema, `tenant_id` on every tenant-scoped table, enforced by PostgreSQL RLS (`FORCE` + policy), tenant context set transaction-locally through one central `withTenant` gate. Never filter by tenant in application code alone.
2. **Vendor-agnostic providers** — payments, shipping, tax, notifications, storage, and search are each a domain-owned port with adapters at the edge. No vendor SDK/type may appear outside its adapter.

When either of these change, update `docs/architecture/architecture.md` **and** the corresponding rule in the skill in the same change.

## Database & tenancy foundation

`apps/api/src/db/` implements the tenancy model described above:

- `data-source.ts` — TypeORM CLI data source, used only by migrations (connects as `app_owner`).
- `database.module.ts` — the app's runtime `TypeOrmModule`, connects as `app_runtime` only (a non-owner role subject to RLS). `synchronize` and `migrationsRun` are both permanently off — schema changes only happen through the CLI as `app_owner`.
- `tenant-db.ts` / `tenant-db.service.ts` — `withTenant(...)` is the **only** place tenant context is set (`SET LOCAL app.current_tenant` inside a transaction via parameterized `set_config`). All tenant-scoped queries must go through `TenantDbService.run(...)`, never inject `DataSource`/`EntityManager` directly for tenant-scoped tables.
- `migrations/helpers/rls.helper.ts` — shared helper for enabling/forcing RLS + policy on a table from within a migration.
- `verify-rls.ts` — checks every tenant-scoped table has RLS `ENABLE`d + `FORCE`d + a policy; run after migrations, see below.
- `entities/base/` — abstract base classes (`TenantEntityBase`, `ImmutableTenantEntityBase`, `EntityBase`, `ImmutableEntityBase`, `CreatedAtEntityBase`) that every entity extends for its PK/timestamp columns; see the "Base entity classes" section in `.claude/skills/backend-engineer/SKILL.md`.

Two Postgres roles exist (see `docker/postgres/init/`, `.env.example`): `app_owner` (migrations, DDL) and `app_runtime` (app connections, RLS-bound). Never point the app's `DATABASE_URL` at `app_owner`.

DB scripts (root or `apps/api`):

```bash
pnpm db:generate <MigrationName>   # generate a migration from entity diffs (wraps typeorm CLI)
pnpm db:migrate                    # run pending migrations, then verify RLS; auto-reverts the run if verification fails
pnpm db:revert                     # revert the last migration
pnpm --filter @tiny-threads/api db:verify-rls   # run the RLS check standalone
```

Local Postgres runs via `docker-compose.yml` (`postgres:16-alpine`, port 5432, healthcheck-gated). Copy `.env.example` to `.env` and fill in passwords before running `docker compose up -d`.

Tests run against a **separate** Postgres instance, never the dev one: `docker-compose.test.yml` adds a `postgres-test` service (port 5433, its own volume, same `docker/postgres/init/` roles). Copy `.env.test.example` to `.env.test` — it's self-contained, with no dependency on the root `.env`; `docker-compose.test.yml` loads it directly via `env_file` to boot the container's roles, and the app/tests connecting to it load the same file (see `apps/api/test/setup-unit.ts`/`setup-e2e.ts`). `pnpm test` / `pnpm test:e2e` (in `apps/api`) auto-start that container and migrate it via `pretest`/`pretest:e2e` hooks — no manual setup needed beyond the one-time `.env.test` copy.

## Commands

Run from the repo root (pnpm workspace: `apps/*`, `packages/*`).

```bash
# install
pnpm install

# run one app in dev
pnpm dev:api     # NestJS, watch mode
pnpm dev:web     # Next.js dev server

# build / lint everything
pnpm build       # pnpm -r build
pnpm lint        # pnpm -r lint
pnpm format      # prettier --write across apps/ and packages/
```

Per-package (run inside `apps/api`, or via `pnpm --filter @tiny-threads/api <script>` from root):

```bash
pnpm test              # jest unit tests
pnpm test:watch
pnpm test:cov
pnpm test:e2e          # jest -c test/jest-e2e.json
pnpm test -- <name>    # run a single test file/pattern, e.g. pnpm test -- app.controller
pnpm start:dev         # nest start --watch
```

`apps/web` has no test runner configured yet; use `pnpm --filter @tiny-threads/web lint` for lint-only checks.

## Conventions

- Prettier: single quotes, trailing commas everywhere (`.prettierrc` at repo root; enforced through ESLint's `prettier/prettier` rule, not a separate check).
- `apps/api` ESLint runs with `recommendedTypeChecked`; `@typescript-eslint/no-explicit-any` is off, `no-floating-promises`/`no-unsafe-argument` are warnings not errors.
- Package names are scoped: `@tiny-threads/api`, `@tiny-threads/web`, `@tiny-threads/shared`.

## Related skill

- `rest-api-design` — resource naming, HTTP methods/status codes, versioning, pagination, and OpenAPI docs for endpoints built on top of the backend conventions above.
