# D2 — Enforce isolation with PostgreSQL RLS + a transaction-scoped context gate

Application `WHERE` filters can't be the security boundary under pooling — one omission is a breach. So: **RLS on every tenant-scoped table** (`FORCE`, plus `USING` + `WITH CHECK` on `app.current_tenant`); the app connects as a **non-owner, non-superuser role** (migrations run as owner); tenant context set **transaction-locally** via `set_config('app.current_tenant', $tenant, true)` through **one central `withTenant` gate**, with the tenant read from AsyncLocalStorage. App-level `tenant_id` filters stay as defense-in-depth and for index usage.

Two caveats are load-bearing: RLS silently does nothing without `FORCE` **and** a non-owner runtime role; and a bare `SET` (vs transaction-local `set_config(..., true)`) leaks context across pooled connections.

*Rejected:* application-only filtering (unsafe under pooling); request-scoped DI for context (rebuilds the provider tree per request, hurts throughput); session-scoped `SET` (unsafe under PgBouncer transaction mode).

**Reference SQL** (RLS on a tenant-scoped table):

```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE  ROW LEVEL SECURITY;   -- owner bypasses RLS without FORCE
CREATE POLICY tenant_isolation ON orders
  USING      (tenant_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
-- missing_ok=true avoids "unrecognized configuration parameter" when the GUC
-- was never set in the session (e.g. migrations); NULL still fails the
-- equality check, so unset context stays fail-closed.
```

**Reference implementation** (`withTenant`, the one central context gate):

```ts
// tenant-db.ts — the ONLY gate. Feature code never touches the DataSource
// directly for tenant data.
import type { DataSource, EntityManager } from 'typeorm';
import type { ClsService } from 'nestjs-cls';

export async function withTenant<T>(
  dataSource: DataSource,
  cls: ClsService,
  work: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  const tenantId = cls.get<string>('tenantId');
  if (!tenantId) throw new Error('withTenant called with no tenant in context'); // fail closed

  return dataSource.transaction(async (manager) => {
    // set_config(name, value, is_local=true) == SET LOCAL, but PARAMETERIZED.
    // Transaction pins one connection, so this applies to every query below and
    // is discarded on COMMIT/ROLLBACK — no bleed across pooled connections.
    await manager.query(`select set_config('app.current_tenant', $1, true)`, [tenantId]);
    return work(manager);
  });
}
```
