# Backend Architecture — Multi-Tenant E-Commerce Platform

The human-facing record of *what* we decided and *why*. Its companion is the **`backend-engineer` skill**, the operating manual (the *how* — rules, code patterns, checklist). This doc explains reasoning; the skill carries the rules. When a decision changes, update the section here **and** the skill's rule in the same change.

Full rationale, rejected alternatives, and reference code for each decision live under [`references/`](references/); this page is the index.

## Context

A **multi-tenant e-commerce marketplace**: dozens of merchant tenants, each selling to *their own* customers (so funds land with the merchant, not the platform). Backend only.

---

## D1 — Tenancy isolation: pooled shared-schema with `tenant_id`

One shared schema, a `tenant_id` column on every tenant-scoped table, for a single migration path, one connection pool, and easy cross-tenant reporting. Safe only because of D2.

*Rejected:* schema-per-tenant, database-per-tenant (kept as the future escape hatch).

→ [references/d1-tenancy-isolation.md](references/d1-tenancy-isolation.md)

## D2 — Enforce isolation with PostgreSQL RLS + a transaction-scoped context gate

RLS (`FORCE` + `USING`/`WITH CHECK`) on every tenant-scoped table; app connects as a non-owner runtime role; tenant context set transaction-locally via `set_config` through one central `withTenant` gate.

*Rejected:* application-only filtering, request-scoped DI for context, session-scoped `SET`.

→ full rationale, RLS SQL, and `withTenant` reference implementation: [references/d2-rls-enforcement.md](references/d2-rls-enforcement.md)

### D2a — `TenantResolutionMiddleware` is the entry point that populates the tenant context

`withTenant` is the gate that *applies* tenant context to a transaction, but it reads that context from CLS rather than taking it as an argument — so something has to put it there first, exactly once, from a source the client cannot forge. That something is **`TenantResolutionMiddleware`** (`apps/api/src/common/middleware/tenant-resolution.middleware.ts`), and it is the **only** thing that populates CLS `tenantId` for ordinary requests. The whole RLS mechanism therefore depends on it: `TenantDbService.run()`/`withTenant` throw rather than falling back if CLS is empty, so a request that bypasses this middleware cannot touch tenant data at all.

It resolves the tenant by looking up the request's **hostname** (`req.hostname`, lowercased) against the `host` column on `tenants` — an exact match, not a pattern or a shared-suffix scheme — and `404`s on no match. Deriving it from the host and never from a request body, query param, or header is the point: a client-supplied tenant id would make RLS trivially bypassable, and `tenant_id` is exactly what the policies compare against.

Because the lookup is an exact match against a real row, there's no separate "is this host trustworthy" step the way a subdomain-suffix scheme would need — an attacker-forged `Host` either matches a genuine tenant's registered host (in which case it's the same origin a legitimate request would use) or it matches nothing and gets the same `404` as an unknown tenant. The middleware also has no required env var and doesn't fail-fast at boot as a result.

There is no tenant-provisioning API today — a tenant's `host` value is inserted directly/manually, the same as before this branch. That's currently safe only because containment used to be structural (a resolvable host had to sit under the platform's own DNS suffix) and is now purely a data invariant on `tenants.host` that nothing in code enforces; any future self-service or automated tenant-provisioning surface will need domain-ownership verification and a reserved-host denylist (to stop a tenant registering the platform's own hostname, or a host it doesn't actually control) before it ships.

Two consequences worth knowing:

- **It is mounted on `forRoutes('*')` with a small, deliberate exclusion list** (`apps/api/src/app/app.module.ts`). Anything excluded must either not touch tenant data or set CLS itself from a verified source. Currently excluded:
  - `GET /auth/google/callback` — a platform-domain route, because Google permits only one registered `redirect_uri` and it cannot be a per-tenant subdomain. It sets CLS itself from the HMAC-signed OAuth `state` before any DB call.
  - `GET /` — the root/liveness route. It touches no tenant data, and health probes arrive by IP or internal DNS name, which resolves to no registered tenant host; behind the middleware every probe would `404` with "Unknown tenant".
- **The request's host becomes a usable security primitive only once it has resolved to a real tenant row** — it is not trustworthy on its own merits. The OAuth `returnUrl` origin check (`apps/api/src/common/utils/return-url.ts`) is built on it: it pins redirect targets to `req.hostname` rather than an allow-list, which also means it keeps working for tenants on a custom domain rather than a platform subdomain. That check is sound **only** because this middleware's lookup ran first; without it, a forged `Host` controls *both* sides of the comparison (the request host and the accepted `returnUrl`), so it passes trivially and the open-redirect/session-theft chain it exists to close is wide open again. Corollary: a route excluded from this middleware has an unvalidated `req.hostname` and must not use it as a security input.

Each tenant has exactly one `host` value; there is no support today for a tenant to be reachable under more than one hostname (e.g. an old and a new custom domain during a migration window) — that would need a separate hosts table.

**Keep in sync:** because this middleware is the sole populator of the context RLS depends on, any change to how the tenant is resolved, or to the exclusion list, must be reflected here **and** in the `backend-engineer` skill's tenancy-isolation rule in the same change.

## D3 — ORM: TypeORM

Entity/repository model with migrations as the source of truth for schema. Chosen for NestJS-ecosystem fit — `@nestjs/typeorm` is the first-party integration, with broader community tooling and examples in the NestJS world. RLS (`ENABLE`/`FORCE`/policy) is not declarable on an entity — TypeORM has no policy API — so it is declared exclusively in raw-SQL migrations.

*Rejected:* Drizzle (SQL-first, auditable, but a lighter NestJS-ecosystem footprint), Prisma (ergonomic, but the query engine hides the SQL, working against auditing the isolation boundary).

→ full rationale and reference `Order` entity + RLS migration: [references/d3-orm-typeorm.md](references/d3-orm-typeorm.md)

## D4 — Application architecture: modular monolith

One NestJS app whose modules map onto bounded contexts, keeping transactional consistency and low operational overhead.

*Rejected:* microservices from the start.

→ [references/d4-modular-monolith.md](references/d4-modular-monolith.md)

## D5 — Vendor-agnostic external providers via ports & adapters

Every external capability is a domain-owned port with adapters at the edge; a registry resolves the adapter per tenant.

*Rejected:* vendor SDKs in domain code, a single fixed provider per capability.

→ [references/d5-ports-adapters.md](references/d5-ports-adapters.md)

### D5a — Implemented ports

| Capability | Port | Adapters |
| --- | --- | --- |
| Notifications (transactional email) | `NotificationsPort` — `apps/api/src/notifications/notifications-port.ts` | `LogNotificationsAdapter` (dev/local: logs the send, redacting any `*token*` data key so log access alone can't hijack an account) |

`NotificationsPort` is the first port to land. It is deliberately narrow — `sendEmail(to, template, data)` over an `EmailTemplate` union (`verification-email`, `password-reset`, `merchant-invite`) — so callers name an intent and never compose provider-specific payloads. It is injected by the `NOTIFICATIONS_PORT` symbol, so no auth service references an adapter type. Swapping in SES/SendGrid/Postmark means adding one adapter and rebinding that token; no domain code changes.

Payments, shipping, tax, storage, and search remain designed-but-unimplemented as ports/adapters (the underlying DB schema for orders/payments already exists — see D6/D7 below).

## D6 — Orders modeled as three coordinated state machines

Lifecycle, payment, and fulfillment are independently-changing concerns modeled as three sub-machines, not one flat enum.

*Rejected:* single flat `status` enum; immediate-capture-only / single-shipment-only / per-merchant configurable flows.

The `orders`/`order_items`/`order_events` tables and entities already exist with RLS enabled (since the initial migration) — it's the state-machine transition logic and its wiring to the payment port that remain unbuilt, not the schema.

→ [references/d6-order-state-machines.md](references/d6-order-state-machines.md)

## D7 — Marketplace payments: split settlement via a payment port

A provider-agnostic `PaymentPort` covering onboarding, split-settlement money movement, and normalized inbound events.

*Rejected:* funds through the platform account then payout; coupling to one gateway's API.

The `payments`/`payment_provider_configs`/`settlements`/`refunds` tables and entities already exist with RLS enabled — the `PaymentPort` implementation and its adapter are what's unbuilt, not the schema.

→ full rationale and `PaymentPort` interface: [references/d7-payment-port.md](references/d7-payment-port.md)

---

## Database Schema

The concrete tables produced by D1/D2's tenancy model — tenant-scoped vs.
global tables, composite PK/FK conventions, and the full ERD — are documented
in [`database-schema.md`](database-schema.md).

**Keep in sync:** any change to the database schema (new table, column,
relationship, or tenancy-scope reclassification) must be reflected in
`database-schema.md` in the same change.

→ [database-schema.md](database-schema.md)

---
