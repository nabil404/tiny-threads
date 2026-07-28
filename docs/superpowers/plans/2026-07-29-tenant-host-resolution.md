# Tenant Host-Based Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `tenants.slug` + `PLATFORM_HOST_SUFFIX` subdomain matching with a single unique `tenants.host` column, exact-matched against the incoming request's hostname, so tenant resolution no longer requires every tenant to live under one shared platform domain.

**Architecture:** `TenantResolutionMiddleware` becomes a plain `findOne({ where: { host: req.hostname.toLowerCase() } })` lookup — no suffix stripping, no slug pattern validation, no required env var. `tenants.slug` is dropped and replaced by `tenants.host` (unique, not null) via an additive migration. All call sites, tests, and docs that referenced `slug`/`PLATFORM_HOST_SUFFIX` are updated to match.

**Tech Stack:** NestJS, TypeORM (migrations authored by hand per project convention — see `apps/api/src/db/migrations/`), Jest (unit + e2e), PostgreSQL.

## Global Constraints

- Each tenant has exactly one `host` value (single column, not an array/child table) — confirmed in the design's environment-handling decision.
- `slug` is removed entirely; `host` is the tenant's only identifier going forward.
- No tenant-provisioning UI/API is in scope — tenants are still inserted directly (matching current behavior; no such module exists today).
- No multi-host-per-tenant support (e.g. supporting both an old and new custom domain) — explicitly out of scope per the design doc.
- `PLATFORM_HOST_SUFFIX` is removed from `.env.example`, the main repo's local `.env`, and all docs referencing it.
- Migrations are hand-authored (never edit `1785070807145-InitialMigration.ts`) and run via `pnpm db:generate`/`pnpm db:migrate` from the repo root per `CLAUDE.md`.

---

### Task 1: Schema — replace `slug` with `host` on `tenants`

**Files:**
- Modify: `apps/api/src/db/entities/tenants.entity.ts`
- Create: `apps/api/src/db/migrations/<generated-timestamp>-AddTenantHostColumn.ts` (exact filename assigned by `db:generate` in Step 2 — do not hand-pick a timestamp)

**Interfaces:**
- Produces: `Tenant.host: string` (replaces `Tenant.slug: string`) — every later task's `Tenant` usage reads/writes `host`, not `slug`.

**Context:** The current local dev database already has ~66 leftover tenant rows accumulated from prior e2e test runs (this is disposable test data, not real merchant data — there is no production deployment yet). A plain `ADD COLUMN "host" text NOT NULL` with no default would fail against those existing rows, so the migration backfills `host` from the existing `slug` value before dropping `slug`, rather than requiring a manual DB cleanup step first.

- [ ] **Step 1: Update the `Tenant` entity**

Edit `apps/api/src/db/entities/tenants.entity.ts` to:

```ts
import { Entity, Column } from 'typeorm';
import { ImmutableEntityBase } from './base';

// Global table — a tenant IS the scope, so no RLS policy.
@Entity({ name: 'tenants' })
export class Tenant extends ImmutableEntityBase {
  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', unique: true })
  host!: string;
}
```

- [ ] **Step 2: Generate a migration skeleton, then replace it with the hand-authored version below**

```bash
pnpm db:generate AddTenantHostColumn
```

This diffs the updated entity against the live DB and creates
`apps/api/src/db/migrations/<generated-timestamp>-AddTenantHostColumn.ts`,
where `<generated-timestamp>` is whatever numeric prefix TypeORM assigned
(the current epoch-ms at generation time — do not rename the file).
Discard the generated file's content (it won't include the backfill step,
and — per the note already present in
`1785182808777-AddRefreshTokenHashIndexes.ts` — may also pick up an
unrelated pre-existing `settlements` table drift; exclude that if present,
same as prior migrations did) and replace it with the code below, changing
only the two `<generated-timestamp>` placeholders (the class name suffix
and the `name` property) to match the actual generated filename's
timestamp:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

// Replaces subdomain-slug resolution (tenants.slug + PLATFORM_HOST_SUFFIX)
// with an exact-match tenants.host column — see
// docs/superpowers/specs/2026-07-29-tenant-host-resolution-design.md.
//
// The backfill (host = slug || '.localhost') exists only so this migration
// doesn't fail against dev/test databases that already have tenant rows
// with no real host value to derive from. There is no production tenant
// data to migrate for real; this is a safety net, not a migration
// strategy. The transform is injective (slug was already unique), so it
// can never collide with the new UNIQUE constraint on host.
export class AddTenantHostColumn<generated-timestamp> implements MigrationInterface {
  name = 'AddTenantHostColumn<generated-timestamp>';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tenants" ADD COLUMN "host" text`);
    await queryRunner.query(
      `UPDATE "tenants" SET "host" = "slug" || '.localhost' WHERE "host" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenants" ALTER COLUMN "host" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenants" DROP CONSTRAINT "UQ_2310ecc5cb8be427097154b18fc"`,
    );
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "slug"`);
    await queryRunner.query(
      `ALTER TABLE "tenants" ADD CONSTRAINT "tenants_host_uq" UNIQUE ("host")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenants" DROP CONSTRAINT "tenants_host_uq"`,
    );
    await queryRunner.query(`ALTER TABLE "tenants" ADD COLUMN "slug" text`);
    await queryRunner.query(
      `UPDATE "tenants" SET "slug" = split_part("host", '.', 1)`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenants" ALTER COLUMN "slug" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenants" ADD CONSTRAINT "UQ_2310ecc5cb8be427097154b18fc" UNIQUE ("slug")`,
    );
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "host"`);
  }
}
```

No `enableRls`/`disableRls` calls: `tenants` has never had an RLS policy (it's the global table tenancy scopes against, per the entity's own comment) and this migration doesn't change that.

- [ ] **Step 3: Run the migration**

```bash
pnpm db:migrate
```

Expected: succeeds. This script runs pending migrations then `db:verify-rls` automatically and auto-reverts if verification fails — a clean run confirms both the schema change and that no RLS policy elsewhere regressed.

- [ ] **Step 4: Verify the migration reverses cleanly**

```bash
pnpm db:revert
pnpm db:migrate
```

Expected: both succeed with no errors — proves `down()` is a true inverse of `up()`, not just a currently-unused code path.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db/entities/tenants.entity.ts apps/api/src/db/migrations/*-AddTenantHostColumn.ts
git commit -m "feat(db): replace tenants.slug with unique tenants.host column"
```

---

### Task 2: Middleware — resolve tenants by exact host match

**Files:**
- Modify: `apps/api/src/tenancy/tenant-resolution.middleware.ts`
- Modify: `apps/api/src/tenancy/__tests__/tenant-resolution.middleware.spec.ts`
- Modify: `apps/api/src/auth-core/return-url.ts` (comment only — no logic change)

**Interfaces:**
- Consumes: `Tenant.host` from Task 1.
- Produces: no change to `TenantResolutionMiddleware`'s public shape (still a `NestMiddleware` with `use(req, res, next)`, still sets CLS `tenantId`) — later tasks depend only on that unchanged shape.

- [ ] **Step 1: Rewrite the middleware spec to describe host-based resolution**

Replace the full contents of `apps/api/src/tenancy/__tests__/tenant-resolution.middleware.spec.ts` with:

```ts
import { NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Request, Response } from 'express';
import { DataSource } from 'typeorm';
import { TenantResolutionMiddleware } from '../tenant-resolution.middleware';

describe('TenantResolutionMiddleware', () => {
  function buildMiddleware(tenant: { id: string; host: string } | null) {
    const findOne = jest.fn().mockResolvedValue(tenant);
    const dataSource = {
      getRepository: jest.fn().mockReturnValue({ findOne }),
    } as unknown as DataSource;
    const set = jest.fn();
    const cls = { set } as unknown as ClsService;
    return {
      middleware: new TenantResolutionMiddleware(dataSource, cls),
      set,
      findOne,
    };
  }

  function request(hostname: string) {
    return { hostname } as unknown as Request;
  }

  const res = {} as unknown as Response;

  it('resolves a tenant by an exact host match and sets it in CLS', async () => {
    const { middleware, set, findOne } = buildMiddleware({
      id: 'tenant-1',
      host: 'shop.tiny-threads.com',
    });
    const next = jest.fn();

    await middleware.use(request('shop.tiny-threads.com'), res, next);

    expect(findOne).toHaveBeenCalledWith({
      where: { host: 'shop.tiny-threads.com' },
    });
    expect(set).toHaveBeenCalledWith('tenantId', 'tenant-1');
    expect(next).toHaveBeenCalled();
  });

  it('resolves a tenant on a custom domain identically to a platform subdomain', async () => {
    const { middleware, set, findOne } = buildMiddleware({
      id: 'tenant-2',
      host: 'shop.merchantbrand.com',
    });
    const next = jest.fn();

    await middleware.use(request('shop.merchantbrand.com'), res, next);

    expect(findOne).toHaveBeenCalledWith({
      where: { host: 'shop.merchantbrand.com' },
    });
    expect(set).toHaveBeenCalledWith('tenantId', 'tenant-2');
    expect(next).toHaveBeenCalled();
  });

  it('throws NotFoundException when no tenant matches the host', async () => {
    const { middleware } = buildMiddleware(null);

    await expect(
      middleware.use(request('unknown.tiny-threads.com'), res, jest.fn()),
    ).rejects.toThrow(NotFoundException);
  });

  // Host headers are case-insensitive per RFC 9110, and browsers/proxies do
  // not normalize them, so a legitimate request must still resolve
  // regardless of case.
  it('resolves a tenant when the Host header is uppercase', async () => {
    const { middleware, set, findOne } = buildMiddleware({
      id: 'tenant-1',
      host: 'shop.tiny-threads.com',
    });
    const next = jest.fn();

    await middleware.use(request('SHOP.TINY-THREADS.COM'), res, next);

    expect(findOne).toHaveBeenCalledWith({
      where: { host: 'shop.tiny-threads.com' },
    });
    expect(set).toHaveBeenCalledWith('tenantId', 'tenant-1');
    expect(next).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the new spec to confirm it fails against the current implementation**

```bash
pnpm --filter @tiny-threads/api test -- tenant-resolution.middleware
```

Expected: FAIL — the current middleware still requires `PLATFORM_HOST_SUFFIX` at construction and queries by `slug`, not `host`.

- [ ] **Step 3: Rewrite the middleware**

Replace the full contents of `apps/api/src/tenancy/tenant-resolution.middleware.ts` with:

```ts
import { Injectable, NestMiddleware, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { NextFunction, Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { DataSource } from 'typeorm';
import { Tenant } from '../db/entities';

// Resolves tenant_id from the request's Host header via an exact match
// against tenants.host, and sets it in CLS for withTenant()/TenantDbService
// to read. One tenant, one host — a custom domain and a platform subdomain
// are resolved identically, since both are just rows in this table.
//
// ⚠️ req.hostname is the client-supplied Host header. Trust in it comes
// entirely from this exact-match lookup: it either matches a real tenant's
// registered host, or it matches nothing and gets the same 404 as an unknown
// tenant. There is no separate "is this host trustworthy" step the way a
// shared-suffix scheme would need. That also makes req.hostname unsafe to
// reuse for anything else on a route that skips this middleware: the OAuth
// returnUrl origin check (auth-core/return-url.ts) compares against this same
// value, and depends on this lookup having already run.
//
// Consequence: any route excluded from this middleware in AppModule has an
// UNVALIDATED req.hostname, and must not use it as a security input.
@Injectable()
export class TenantResolutionMiddleware implements NestMiddleware {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cls: ClsService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    // Host headers are case-insensitive per RFC 9110, and browsers/proxies do
    // not normalize them, so lowercase before comparing or looking up.
    const hostname = req.hostname.toLowerCase();

    const tenant = await this.dataSource
      .getRepository(Tenant)
      .findOne({ where: { host: hostname } });
    if (!tenant) {
      throw new NotFoundException('Unknown tenant');
    }
    this.cls.set('tenantId', tenant.id);
    next();
  }
}
```

- [ ] **Step 4: Run the spec again to confirm it passes**

```bash
pnpm --filter @tiny-threads/api test -- tenant-resolution.middleware
```

Expected: PASS, all tests green.

- [ ] **Step 5: Update the stale comment in `return-url.ts`**

The logic in `apps/api/src/auth-core/return-url.ts` does not change — it already compares `parsed.hostname` to `req.hostname.toLowerCase()`, which is unaffected by how the middleware resolved that hostname. Only the file's header comment describes the now-removed suffix mechanism and needs updating. Replace lines 19–25 (the `⚠️ This is only sound because...` paragraph) with:

```ts
// ⚠️ This is only sound because TenantResolutionMiddleware has already
// matched req.hostname against a real tenant's `host` column and resolved
// it to a tenant. req.hostname is otherwise just the client-supplied Host
// header: without that upstream lookup, an attacker could send any Host
// they like and control BOTH sides of the comparison below. Never call this
// from a route excluded from that middleware.
```

- [ ] **Step 6: Run the full unit suite to confirm no other test references the removed behavior**

```bash
pnpm --filter @tiny-threads/api test
```

Expected: same pass/fail counts as the pre-existing baseline (206 passed, 4 failed — the 4 failures are the pre-existing, unrelated `tenant-db.spec.ts` gap noted in `CLAUDE.md`/project history, not something this task touches). No new failures.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/tenancy/tenant-resolution.middleware.ts apps/api/src/tenancy/__tests__/tenant-resolution.middleware.spec.ts apps/api/src/auth-core/return-url.ts
git commit -m "feat(tenancy): resolve tenants by exact host match instead of slug+suffix"
```

---

### Task 3: e2e fixtures — switch RLS test tenants from `slug` to `host`

**Files:**
- Modify: `apps/api/test/customer-refresh-tokens-rls.e2e-spec.ts:35,41`
- Modify: `apps/api/test/merchant-user-refresh-tokens-rls.e2e-spec.ts:44,50`

**Interfaces:**
- Consumes: `Tenant.host` from Task 1, updated `TenantResolutionMiddleware` from Task 2 (these e2e specs boot the full `AppModule`, so a stale `slug` reference here would fail at the TypeORM/entity level, not just semantically).

- [ ] **Step 1: Update `customer-refresh-tokens-rls.e2e-spec.ts`**

In the `beforeAll` block, replace:

```ts
    const tenantA = await tenantRepo.save(
      tenantRepo.create({
        name: 'RLS Test Tenant A',
        slug: `rls-test-a-${randomUUID()}`,
      }),
    );
    const tenantB = await tenantRepo.save(
      tenantRepo.create({
        name: 'RLS Test Tenant B',
        slug: `rls-test-b-${randomUUID()}`,
      }),
    );
```

with:

```ts
    const tenantA = await tenantRepo.save(
      tenantRepo.create({
        name: 'RLS Test Tenant A',
        host: `rls-test-a-${randomUUID()}.localhost`,
      }),
    );
    const tenantB = await tenantRepo.save(
      tenantRepo.create({
        name: 'RLS Test Tenant B',
        host: `rls-test-b-${randomUUID()}.localhost`,
      }),
    );
```

- [ ] **Step 2: Update `merchant-user-refresh-tokens-rls.e2e-spec.ts`**

In the `beforeAll` block, replace:

```ts
    const tenantA = await tenantRepo.save(
      tenantRepo.create({
        name: 'MU RLS Test Tenant A',
        slug: `mu-rls-test-a-${randomUUID()}`,
      }),
    );
    const tenantB = await tenantRepo.save(
      tenantRepo.create({
        name: 'MU RLS Test Tenant B',
        slug: `mu-rls-test-b-${randomUUID()}`,
      }),
    );
```

with:

```ts
    const tenantA = await tenantRepo.save(
      tenantRepo.create({
        name: 'MU RLS Test Tenant A',
        host: `mu-rls-test-a-${randomUUID()}.localhost`,
      }),
    );
    const tenantB = await tenantRepo.save(
      tenantRepo.create({
        name: 'MU RLS Test Tenant B',
        host: `mu-rls-test-b-${randomUUID()}.localhost`,
      }),
    );
```

- [ ] **Step 3: Run the e2e suite**

```bash
pnpm --filter @tiny-threads/api test:e2e
```

Expected: PASS — same result shape as the pre-existing baseline (9 passed, 3 suites), confirming both RLS specs still exercise real tenant rows end-to-end with the new column.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/customer-refresh-tokens-rls.e2e-spec.ts apps/api/test/merchant-user-refresh-tokens-rls.e2e-spec.ts
git commit -m "test: update RLS e2e fixtures for tenants.host"
```

---

### Task 4: Docs and env — remove `PLATFORM_HOST_SUFFIX`, document host-based resolution

**Files:**
- Modify: `.env.example`
- Modify: `/Users/nabilnms/Projects/tiny-threads/.env` (local, gitignored — not committed)
- Modify: `docs/architecture/architecture.md`
- Modify: `.claude/skills/backend-engineer/SKILL.md`

**Interfaces:** None — documentation only, no code depends on this task.

- [ ] **Step 1: Remove `PLATFORM_HOST_SUFFIX` from `.env.example`**

Delete this block (the `PLATFORM_HOST_SUFFIX` variable and its preceding comment):

```
# The platform's own DNS suffix, i.e. everything after the tenant subdomain.
# In prod: .tiny-threads.com (so shop.tiny-threads.com -> slug "shop").
# Locally: .localhost (so shop.localhost:3000 -> slug "shop").
#
# SECURITY: this is what makes the request's Host header trustworthy.
# TenantResolutionMiddleware rejects (404, same as an unknown tenant) any
# request whose Host doesn't end with this suffix, and only then reads the
# leading label as the tenant slug. Without it, an attacker forging
# `Host: <real-slug>.evil.example` resolves the REAL tenant for that slug, and
# every host-derived check downstream (notably the OAuth returnUrl origin
# check) inherits the forgery. Required — the app throws at boot if unset.
# Keep the leading dot; a bare "tiny-threads.com" would also match
# "eviltiny-threads.com" (the middleware re-adds it defensively).
PLATFORM_HOST_SUFFIX=.localhost

```

Leave the blank line and the following `PLATFORM_BASE_URL` variable/comment untouched — it's unrelated (used for OAuth redirect origin, not tenant resolution).

- [ ] **Step 2: Remove `PLATFORM_HOST_SUFFIX` from the local `.env`**

Delete the line `PLATFORM_HOST_SUFFIX=.localhost` and its preceding `# Platform DNS suffix — see .env.example for why this is security-relevant.` comment from `/Users/nabilnms/Projects/tiny-threads/.env`. This file is gitignored, so this step has no git diff — it only keeps local dev config in sync with the removed env var.

- [ ] **Step 3: Rewrite the D2a section of `docs/architecture/architecture.md`**

Replace the entire `### D2a — TenantResolutionMiddleware is the entry point that populates the tenant context` section (from that heading through the line ending `...Custom-domain resolution (as opposed to subdomain) is a known follow-up and is not implemented.` and its following `**Keep in sync:**` paragraph) with:

```markdown
### D2a — `TenantResolutionMiddleware` is the entry point that populates the tenant context

`withTenant` is the gate that *applies* tenant context to a transaction, but it reads that context from CLS rather than taking it as an argument — so something has to put it there first, exactly once, from a source the client cannot forge. That something is **`TenantResolutionMiddleware`** (`apps/api/src/tenancy/tenant-resolution.middleware.ts`), and it is the **only** thing that populates CLS `tenantId` for ordinary requests. The whole RLS mechanism therefore depends on it: `TenantDbService.run()`/`withTenant` throw rather than falling back if CLS is empty, so a request that bypasses this middleware cannot touch tenant data at all.

It resolves the tenant by looking up the request's **hostname** (`req.hostname`, lowercased) against the `host` column on `tenants` — an exact match, not a pattern or a shared-suffix scheme — and `404`s on no match. Deriving it from the host and never from a request body, query param, or header is the point: a client-supplied tenant id would make RLS trivially bypassable, and `tenant_id` is exactly what the policies compare against.

Because the lookup is an exact match against a real row, there's no separate "is this host trustworthy" step the way a subdomain-suffix scheme would need — an attacker-forged `Host` either matches a genuine tenant's registered host (in which case it's the same origin a legitimate request would use) or it matches nothing and gets the same `404` as an unknown tenant. The middleware also has no required env var and doesn't fail-fast at boot as a result.

Two consequences worth knowing:

- **It is mounted on `forRoutes('*')` with a small, deliberate exclusion list** (`apps/api/src/app/app.module.ts`). Anything excluded must either not touch tenant data or set CLS itself from a verified source. Currently excluded:
  - `GET /auth/google/callback` — a platform-domain route, because Google permits only one registered `redirect_uri` and it cannot be a per-tenant subdomain. It sets CLS itself from the HMAC-signed OAuth `state` before any DB call.
  - `GET /` — the root/liveness route. It touches no tenant data, and health probes arrive by IP or internal DNS name, which resolves to no registered tenant host; behind the middleware every probe would `404` with "Unknown tenant".
- **The request's host becomes a usable security primitive only once it has resolved to a real tenant row** — it is not trustworthy on its own merits. The OAuth `returnUrl` origin check (`apps/api/src/auth-core/return-url.ts`) is built on it: it pins redirect targets to `req.hostname` rather than an allow-list, which also means it keeps working for tenants on a custom domain rather than a platform subdomain. That check is sound **only** because this middleware's lookup ran first; without it, a forged `Host` controls *both* sides of the comparison (the request host and the accepted `returnUrl`), so it passes trivially and the open-redirect/session-theft chain it exists to close is wide open again. Corollary: a route excluded from this middleware has an unvalidated `req.hostname` and must not use it as a security input.

Each tenant has exactly one `host` value; there is no support today for a tenant to be reachable under more than one hostname (e.g. an old and a new custom domain during a migration window) — that would need a separate hosts table.

**Keep in sync:** because this middleware is the sole populator of the context RLS depends on, any change to how the tenant is resolved, or to the exclusion list, must be reflected here **and** in the `backend-engineer` skill's tenancy-isolation rule in the same change.
```

- [ ] **Step 4: Rewrite the corresponding bullets in `.claude/skills/backend-engineer/SKILL.md`**

Replace the four bullets (the `TenantResolutionMiddleware` bullet through the `A route's host is reusable...` bullet — currently lines 61–65 of that file) with:

```markdown
- ⚠️ **`TenantResolutionMiddleware` (`apps/api/src/tenancy/tenant-resolution.middleware.ts`) is the concrete gate that populates CLS, and the only thing that does so** for ordinary requests. It resolves the tenant by an *exact* match of the request's hostname (`req.hostname`, lowercased since `Host` is case-insensitive per RFC 9110 and nothing normalizes it) against the `host` column on `tenants`, `404`s on no match, and sets CLS `tenantId`. `req.hostname` is otherwise just the client-supplied `Host` header — trust in it comes entirely from this exact-match lookup, not from any separate validation step. Everything below — `withTenant`, `TenantDbService.run`, every RLS policy — depends on it having run. (Multiple hosts per tenant — e.g. migrating between custom domains — is a known follow-up; JWT claims are **not** a tenant source here — see below.)
- **Never derive the tenant from client-controlled input** — not a body field, query param, header, or the `tenantId` claim of a JWT. The host is the only source, because RLS compares against exactly this value; accepting a client-supplied one makes the whole mechanism bypassable. Access tokens *do* carry `tenantId`, but it is used only to **cross-check** against the CLS-resolved tenant (both JWT strategies reject a mismatch with a 401), never as the source.
- **It is mounted `forRoutes('*')` in `AppModule` with a short, deliberate `.exclude(...)` list.** Adding an exclusion is a tenancy decision, not a routing tweak: an excluded route must either touch no tenant data or set CLS itself from a verified source. Current exclusions are `GET /auth/google/callback` (platform-domain route — Google allows one registered `redirect_uri`, so it sets CLS from the HMAC-signed OAuth state before any DB call) and `GET /` (liveness; health probes arrive by IP or internal DNS with no registered tenant host, so behind the middleware every probe `404`s).
- **A route's host is reusable for security checks only once it has resolved to a real tenant row** — never on its own. The OAuth `returnUrl` origin check in `apps/api/src/auth-core/return-url.ts` pins redirect targets to `req.hostname` rather than an allow-list, but it is sound *only* because this middleware already matched `req.hostname` against a real tenant's `host`; on an excluded route, a forged `Host` controls both sides of that comparison and it passes trivially. Two rules follow — never use `req.hostname` as a security input on a route excluded from this middleware, and lowercase it before comparing (`URL.hostname` is already lowercased by the WHATWG parser, so a raw comparison spuriously rejects legitimate requests).
```

- [ ] **Step 5: Confirm no stale references remain**

```bash
grep -rn "PLATFORM_HOST_SUFFIX" /Users/nabilnms/Projects/tiny-threads --include="*.md" --include="*.env*" --include="*.ts" | grep -v node_modules | grep -v docs/superpowers/specs
```

Expected: no output (the design spec document itself is the only remaining reference, and it's a historical record, not live docs/code — intentionally excluded from this grep).

- [ ] **Step 6: Commit**

```bash
git add .env.example docs/architecture/architecture.md .claude/skills/backend-engineer/SKILL.md
git commit -m "docs: document host-based tenant resolution, remove PLATFORM_HOST_SUFFIX"
```

(The local `.env` edit from Step 2 is gitignored and not part of this commit.)
