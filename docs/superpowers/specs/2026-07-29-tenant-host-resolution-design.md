# Tenant host-based resolution — design

## Problem

Tenant resolution currently works by matching a subdomain slug against a
platform-wide suffix: `TenantResolutionMiddleware` requires `PLATFORM_HOST_SUFFIX`
to be set, strips it off `req.hostname`, validates the remainder against
`SLUG_PATTERN`, and looks up a `Tenant` by `slug`. This only supports tenants
living under one shared platform domain (`<slug>.<suffix>`) and was flagged in
its own code comments as a known gap: "Custom-domain resolution is a known
follow-up, not implemented here."

## Decision

Replace slug+suffix resolution with a single `host` column on `tenants`,
matched exactly against the incoming request's hostname. `slug` is removed —
`host` is the tenant's only identifier going forward.

## Schema

`tenants` table: drop `slug` (text, unique), add `host` (text, unique, not
null) — the tenant's full DNS hostname, no port, no scheme (e.g.
`shop1.tinythreads.com` in production, `shop1.localhost` in local dev).

```ts
@Entity({ name: 'tenants' })
export class Tenant extends ImmutableEntityBase {
  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', unique: true })
  host!: string;
}
```

Each tenant has exactly one `host` value. Dev/staging/prod are separate
databases with separate seed data, so each environment's tenant rows simply
carry the host value appropriate to that environment — no environment
detection or multi-host-per-tenant support is needed.

## Middleware

`TenantResolutionMiddleware` drops the suffix/slug-pattern logic and the
`PLATFORM_HOST_SUFFIX` env var entirely. It becomes a plain exact-match
lookup:

```ts
async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
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
```

- No constructor env-var check, no fail-fast on missing config.
- Still uses `req.hostname` (port stripped), consistent with
  `assertReturnUrlMatchesRequestHost` in `auth-core/return-url.ts`, which
  already compares against `req.hostname` and already anticipated custom
  domains landing later. That file needs no logic change — only its comment
  updated, since the trust chain is now "exact DB match" rather than "suffix
  match."
- This is a slightly stronger invariant than today's: an exact match against
  a known tenant row, rather than "ends with a known suffix." The
  unauthenticated-enumeration property is preserved — unknown host still
  produces the same 404 as before.
- Route exclusions in `app.module.ts` (OAuth callback, health check) are
  path-based, not host-based, and are unaffected by this change.

## Migration

A new additive migration (not editing the existing
`1785070807145-InitialMigration.ts`): drop the `slug` column/unique index, add
`host` as unique not null. There is no seed/production data yet, so no
backfill logic is required — this is a straight column swap.

## Test & fixture updates

- `apps/api/test/customer-refresh-tokens-rls.e2e-spec.ts`,
  `apps/api/test/merchant-user-refresh-tokens-rls.e2e-spec.ts`, and
  `apps/api/src/tenancy/__tests__/tenant-resolution.middleware.spec.ts`
  currently create tenants with `slug: ...` — these switch to
  `host: ...` with a unique per-test hostname value (e.g.
  `` `rls-test-a-${randomUUID()}.localhost` ``).

## Documentation updates

- `.env.example`, `/Users/nabilnms/Projects/tiny-threads/.env` — remove
  `PLATFORM_HOST_SUFFIX`.
- `docs/architecture/architecture.md`,
  `.claude/skills/backend-engineer/SKILL.md` — remove
  `PLATFORM_HOST_SUFFIX` documentation, replace with a short note that
  tenant resolution is by exact `host` column match, and that provisioning a
  tenant means inserting its row with the literal hostname it will be
  reached at in that environment.

## Out of scope

- Any tenant-provisioning UI/API (none exists today — tenants are inserted
  directly, same as before).
- Multiple hosts per tenant (e.g. supporting both an old and new custom
  domain during a migration window) — deferred; would need a separate
  `tenant_hosts` table if ever needed.
