# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Tiny Threads is a **multi-tenant e-commerce marketplace** backend (dozens of merchant tenants, each selling to their own customers) plus a Next.js storefront/admin frontend. It's a pnpm monorepo:

- `apps/api` — NestJS backend (the substantive app). Currently a fresh Nest scaffold; no domain modules exist yet.
- `apps/web` — Next.js 16 (App Router) frontend. Currently a fresh `create-next-app` scaffold.
- `packages/shared` — shared TypeScript code between `api` and `web` (currently empty, just `src/index.ts`).
- `docs/architecture/architecture.md` — the decision record (the *why*) for the backend architecture, with full rationale per decision under `docs/architecture/references/`.

**Read `.claude/skills/backend-engineer/SKILL.md` before touching any backend code** — it is the operating manual (the *how*: tenancy rules, ORM conventions, provider ports, order state machine) that `docs/architecture/architecture.md` is the record for. It is invoked automatically for backend work, but skim it directly if you want the full detail up front. Two areas in it are marked ⚠️ because getting them wrong is a data breach or vendor lock-in, not a style nit:

1. **Tenancy isolation** — pooled shared schema, `tenant_id` on every tenant-scoped table, enforced by PostgreSQL RLS (`FORCE` + policy), tenant context set transaction-locally through one central `withTenant` gate. Never filter by tenant in application code alone.
2. **Vendor-agnostic providers** — payments, shipping, tax, notifications, storage, and search are each a domain-owned port with adapters at the edge. No vendor SDK/type may appear outside its adapter.

When either of these change, update `docs/architecture/architecture.md` **and** the corresponding rule in the skill in the same change.

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
