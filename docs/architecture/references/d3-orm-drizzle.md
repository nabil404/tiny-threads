# D3 — ORM: Drizzle

Drizzle (node-postgres driver). Its SQL-first design keeps the tenancy boundary explicit and auditable, and raw transaction control makes the [`withTenant` / `set_config` gate](d2-rls-enforcement.md) straightforward; RLS policies are declared in-schema via `pgPolicy`. Note: Drizzle emits `ENABLE` but not `FORCE` RLS, so `FORCE ROW LEVEL SECURITY` must be added manually in a migration.

*Rejected:* TypeORM (heavier, gate via query-runner subscriber) and Prisma (ergonomic, but the query engine hides the SQL, working against auditing the isolation boundary).

**Reference schema** (policy declared in-schema, `to` targets the app runtime role — not the migration-owner role):

```ts
import { pgTable, pgRole, uuid, text, timestamp, index, unique, pgPolicy } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const appRole = pgRole('app_runtime').existing();

export const orders = pgTable('orders', {
  id:        uuid().primaryKey().defaultRandom(),
  tenantId:  uuid('tenant_id').notNull(),
  number:    text().notNull(),
  status:    text().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('orders_tenant_created_idx').on(t.tenantId, t.createdAt),   // tenant_id leads
  unique('orders_tenant_number_uq').on(t.tenantId, t.number),       // composite unique
  pgPolicy('tenant_isolation', {
    for: 'all',
    to: appRole,
    using:     sql`${t.tenantId} = current_setting('app.current_tenant')::uuid`,
    withCheck: sql`${t.tenantId} = current_setting('app.current_tenant')::uuid`,
  }),
]);
```
