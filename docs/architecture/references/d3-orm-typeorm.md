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

**Reference migration** (the policy — declared once, in the same migration that creates the table):

```ts
await queryRunner.query(`ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY`);
await queryRunner.query(`ALTER TABLE "orders" FORCE ROW LEVEL SECURITY`);
await queryRunner.query(`
  CREATE POLICY tenant_isolation ON "orders"
    FOR ALL
    TO app_runtime
    USING      (tenant_id = current_setting('app.current_tenant')::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid)
`);
```

Every new tenant-scoped table follows the same two-step workflow: run `migration:generate` to get the auto-diffed `CREATE TABLE` migration from entity metadata, then hand-append the three RLS statements above to that same migration's `up()` (and the teardown to `down()`). `migration:generate` only diffs entity metadata against the database, so it has no concept of policies — it will never auto-regenerate or conflict with a hand-added policy.

**Gotcha carried forward, not solved by this design:** there is no compiler-enforced link between an entity's `@Entity({ name: ... })` table name and the raw-SQL `CREATE POLICY ... ON "..."` string in its migration. Renaming a table means remembering to update the migration by hand — catch this in review (see the `backend-engineer` skill's pre-merge checklist).
