# D1 — Tenancy isolation: pooled shared-schema with `tenant_id`

One shared schema, a `tenant_id` column on every tenant-scoped table. Chosen for the single migration path, one connection pool, and easy cross-tenant reporting. The accepted cost is noisy neighbors (shared CPU/connections/cache), contained by per-tenant rate limits, cache keys, and job context. Safe only because of [D2](d2-rls-enforcement.md). Never assume tenants are permanently co-located — a whale tenant can move to its own database later.

*Rejected:* schema-per-tenant (near-silo isolation, but loses the single migration path and easy analytics) and database-per-tenant (operationally heavy at this scale; kept as the future escape hatch).
