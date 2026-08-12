# GEMINI.md

This file provides guidance to Gemini / Antigravity AI agents working in the **Tiny Threads** repository.

---

## 1. Overview

**Tiny Threads** is a multi-tenant e-commerce marketplace platform built as a `pnpm` monorepo:

- **`apps/api`**: NestJS 11 backend providing core APIs, authentication, PostgreSQL Row-Level Security (RLS) multi-tenancy, error handling, provider ports, and domain services.
  - **See detailed guide**: [`apps/api/GEMINI.md`](apps/api/GEMINI.md)
- **`apps/admin-web`**: React SPA (Vite, React 19, Redux Toolkit, Tailwind CSS v4, shadcn/ui) frontend for merchant administration.
  - **See detailed guide**: [`apps/admin-web/GEMINI.md`](apps/admin-web/GEMINI.md)
- **`packages/shared`**: Shared TypeScript package (`@tiny-threads/shared`) containing error-envelope contracts, error codes, and shared schemas.
- **`docs/`**: Architectural Decision Records (ADRs), database schema/ERD specifications, and feature design docs.
- **`.agents/skills/`**: Repository skills (`backend-engineer`, `frontend-engineer`, `rest-api-design`, `docker-compose-orchestration`, `multi-stage-dockerfile`).

---

## 2. Workspace Applications & Documentation Entry Points

When working on a specific application or package, refer to its dedicated instruction file for detailed conventions, tenancy rules, and testing requirements:

| Application / Package | Technology Stack | Documentation Entry Point |
|---|---|---|
| **Backend API** (`apps/api`) | NestJS 11, PostgreSQL 16, RLS, TypeORM | [`apps/api/GEMINI.md`](apps/api/GEMINI.md) |
| **Admin Web** (`apps/admin-web`) | Vite, React 19, Redux Toolkit, Tailwind v4 | [`apps/admin-web/GEMINI.md`](apps/admin-web/GEMINI.md) |
| **Shared Package** (`packages/shared`) | TypeScript library | [`packages/shared/`](packages/shared/) |

---

## 3. Tech Stack Summary

- **Runtime & Package Manager**: Node.js (`>=22`), `pnpm` workspaces (`apps/*`, `packages/*`)
- **Backend Framework**: NestJS 11, TypeORM, Express, Passport, Argon2, `nestjs-cls`
- **Database**: PostgreSQL 16 with Row-Level Security (RLS) enabled
- **Frontend Framework**: React 19, Vite, Redux Toolkit, Tailwind CSS 4, shadcn/ui
- **Testing & Tooling**: Jest, Supertest, ESLint, Prettier, Docker Compose

---

## 4. Root Repository Workflows & Commands

### Prerequisites & Infrastructure Setup

```bash
pnpm install
cp apps/api/.env.example apps/api/.env                    # Copy API dev configuration
cp apps/api/.env.test.example apps/api/.env.test           # Copy API test database configuration
cp apps/admin-web/.env.example apps/admin-web/.env.local  # Copy Admin Web configuration
docker compose up -d                                       # Start local development PostgreSQL container
```

### Running Applications

```bash
pnpm dev:api         # Start NestJS API in watch mode (@tiny-threads/api)
pnpm dev:admin-web   # Start Vite dev server (@tiny-threads/admin-web)
```

### Repository Quality Checks & Build

```bash
pnpm build           # Build all workspace packages and applications
pnpm lint            # Run ESLint across all apps and packages
pnpm format          # Format repository using Prettier
```

### Database Operations (Root Helpers)

```bash
pnpm db:generate <MigrationName>                 # Generate migration from TypeORM entity diffs
pnpm db:migrate                                  # Run pending migrations and verify RLS
pnpm db:revert                                   # Revert most recently executed migration
pnpm --filter @tiny-threads/api db:verify-rls    # Run RLS verification standalone
```

### Backend Testing

```bash
pnpm --filter @tiny-threads/api test             # Run backend unit & integration tests
pnpm --filter @tiny-threads/api test:e2e         # Run backend E2E tests
```

---

## 5. Essential References

- **Backend Operating Manual**: `.agents/skills/backend-engineer/SKILL.md`
- **Frontend Operating Manual**: `.agents/skills/frontend-engineer/SKILL.md`
- **REST API Guidelines**: `.agents/skills/rest-api-design/SKILL.md`
- **Architecture Rationale**: `docs/architecture/architecture.md`
- **Database ERD & Schema Spec**: `docs/architecture/database-schema.md`
- **Authentication Design**: `docs/architecture/authentication.md`
- **Error-Handling Design**: `docs/architecture/error-handling.md`
- **Database Conventions**: `docs/architecture/database-conventions.md`
