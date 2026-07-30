# D3 — ORM: TypeORM

TypeORM (`pg` driver via `@nestjs/typeorm`). Chosen for NestJS-ecosystem fit — `@nestjs/typeorm` is the first-party integration, with broader community tooling and examples in the NestJS world than a SQL-first library offers. Entities describe columns and constraints only; TypeORM has no declarative RLS/policy API, so `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, and the tenant policy are declared exclusively in raw-SQL migrations — never in the entity.

*Rejected:* Drizzle (SQL-first design kept the tenancy boundary explicit and in-schema via `pgPolicy`, but a lighter NestJS-ecosystem footprint than TypeORM's first-party integration) and Prisma (ergonomic, but the query engine hides the SQL, working against auditing the isolation boundary).

**Reference entity** (columns/constraints only — no policy here):

```ts
import { Entity, PrimaryColumn, Column, CreateDateColumn, Index, Unique, BeforeInsert } from 'typeorm';
import { uuidv7 } from 'uuidv7';

@Entity({ name: 'orders' })
@Index('orders_tenant_created_idx', ['tenantId', 'createdAt'])   // tenant_id leads
@Unique('orders_tenant_number_uq', ['tenantId', 'number'])       // composite unique
export class Order {
  @PrimaryColumn({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  number!: string;

  @Column({ type: 'text' })
  status!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @BeforeInsert()
  generateId() {
    this.id ??= uuidv7();
  }
}
```

**Reference migration** (the policy — declared once, in the same migration that creates the table, via the shared helper in `apps/api/src/db/migrations/helpers/rls.helper.ts`):

```ts
import { enableRls, disableRls } from '../helpers/rls.helper';

// up()
await queryRunner.query(`CREATE TABLE "orders" (...)`);
await enableRls(queryRunner, 'orders');

// down()
await disableRls(queryRunner, 'orders');
await queryRunner.query(`DROP TABLE "orders"`);
```

Every new tenant-scoped table follows the same two-step workflow: run `migration:generate` to get the auto-diffed `CREATE TABLE` migration from entity metadata, then call `enableRls(queryRunner, table)` / `disableRls(...)` in that same migration's `up()`/`down()`, adjacent to the `CREATE`/`DROP TABLE`. `enableRls` issues `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, and the tenant policy, then immediately re-reads `pg_catalog` in the same transaction to assert all three actually took — a broken call fails the whole migration (and its `CREATE TABLE`) rather than shipping an unprotected table. `migration:generate` only diffs entity metadata against the database, so it has no concept of policies — it will never auto-regenerate or conflict with the helper's calls.

**Gotcha carried forward, not solved by this design:** there is no compiler-enforced link between an entity's `@Entity({ name: ... })` table name and the raw-SQL `CREATE POLICY ... ON "..."` string in its migration. Renaming a table means remembering to update the migration by hand — catch this in review (see the `backend-engineer` skill's pre-merge checklist).
