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

`withTenant` is the gate that *applies* tenant context to a transaction, but it reads that context from CLS rather than taking it as an argument — so something has to put it there first, exactly once, from a source the client cannot forge. That something is **`TenantResolutionMiddleware`** (`apps/api/src/tenancy/tenant-resolution.middleware.ts`), and it is the **only** thing that populates CLS `tenantId` for ordinary requests. The whole RLS mechanism therefore depends on it: `TenantDbService.run()`/`withTenant` throw rather than falling back if CLS is empty, so a request that bypasses this middleware cannot touch tenant data at all.

It resolves the tenant from the request's **subdomain** (`shop.platform.com` → slug `shop`), looks the tenant up, and `404`s on an unknown slug. Deriving it from the host and never from a request body, query param, or header is the point: a client-supplied tenant id would make RLS trivially bypassable, and `tenant_id` is exactly what the policies compare against.

**But the host is itself client-supplied**, so it earns trust only by being checked. `req.hostname` is just the `Host` header; nothing validates it by default. The middleware therefore requires the hostname to end with the platform's own configured DNS suffix (**`PLATFORM_HOST_SUFFIX`**, required at boot — the middleware throws if unset) *before* reading anything out of it, then takes the remainder as the slug and requires it to be a single DNS label. Every failure — wrong suffix, multi-label slug, empty slug, IP-address host, unknown slug — returns the same `404`, so the endpoint can't be used to enumerate real tenants.

Skipping that check is not a cosmetic omission. Taking the first label of an unvalidated host means an attacker forging `Host: shop.evil.example` resolves the **real** tenant for the genuine slug `shop` — the slug is real, only the parent domain is forged — which is an unauthenticated foothold on that tenant, and it simultaneously poisons every downstream host-derived check (see the next bullet). The suffix must keep its leading dot for the same reason: a bare `platform.com` also matches `evilplatform.com` as a string tail, yielding slug `evil` on an attacker-owned domain, so the middleware re-adds the dot defensively.

Two consequences worth knowing:

- **It is mounted on `forRoutes('*')` with a small, deliberate exclusion list** (`apps/api/src/app/app.module.ts`). Anything excluded must either not touch tenant data or set CLS itself from a verified source. Currently excluded:
  - `GET /auth/google/callback` — a platform-domain route, because Google permits only one registered `redirect_uri` and it cannot be a per-tenant subdomain. It sets CLS itself from the HMAC-signed OAuth `state` before any DB call.
  - `GET /` — the root/liveness route. It touches no tenant data, and health probes arrive by IP or internal DNS name, which resolves to no tenant slug; behind the middleware every probe would `404` with "Unknown tenant".
- **The request's host becomes a usable security primitive only downstream of that suffix check** — it is not trustworthy on its own merits. The OAuth `returnUrl` origin check (`apps/api/src/auth-core/return-url.ts`) is built on it: it pins redirect targets to `req.hostname` rather than an allow-list, which also means it keeps working when custom-domain resolution lands. That check is sound **only** because `PLATFORM_HOST_SUFFIX` validation ran first; without it, a forged `Host` controls *both* sides of the comparison (the request host and the accepted `returnUrl`), so it passes trivially and the open-redirect/session-theft chain it exists to close is wide open again. Corollary: a route excluded from this middleware has an unvalidated `req.hostname` and must not use it as a security input.

Custom-domain resolution (as opposed to subdomain) is a known follow-up and is not implemented.

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
| Notifications (transactional email) | `NotificationsPort` — `apps/api/src/auth-core/notifications/notifications-port.ts` | `LogNotificationsAdapter` (dev/local: logs the send, redacting any `*token*` data key so log access alone can't hijack an account) |

`NotificationsPort` is the first port to land. It is deliberately narrow — `sendEmail(to, template, data)` over an `EmailTemplate` union (`verification-email`, `password-reset`, `merchant-invite`) — so callers name an intent and never compose provider-specific payloads. It is injected by the `NOTIFICATIONS_PORT` symbol, so no auth service references an adapter type. Swapping in SES/SendGrid/Postmark means adding one adapter and rebinding that token; no domain code changes.

Payments, shipping, tax, storage, and search remain designed-but-unimplemented.

## D6 — Orders modeled as three coordinated state machines

Lifecycle, payment, and fulfillment are independently-changing concerns modeled as three sub-machines, not one flat enum.

*Rejected:* single flat `status` enum; immediate-capture-only / single-shipment-only / per-merchant configurable flows.

→ [references/d6-order-state-machines.md](references/d6-order-state-machines.md)

## D7 — Marketplace payments: split settlement via a payment port

A provider-agnostic `PaymentPort` covering onboarding, split-settlement money movement, and normalized inbound events.

*Rejected:* funds through the platform account then payout; coupling to one gateway's API.

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
