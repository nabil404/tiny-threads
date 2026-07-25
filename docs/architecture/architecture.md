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
