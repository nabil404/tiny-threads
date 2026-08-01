# API Review Remediation — Batch 4 (Schema Quality & API Shape) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement database performance indexes, tenant settings singleton constraint and transformer, order list pagination, and dynamic store currency support across `apps/api`.

**Architecture:** A single database migration (`1785340000000-AddBatch4IndexesAndTenantSettings.ts`) adds schema constraints and performance indexes. The domain/entity layer updates `TenantSettings` and adds matching `@Index` decorators on commerce entities. Service methods handle pagination, dynamic currency resolution during checkout, and idempotent settings initialization.

**Tech Stack:** NestJS 11, TypeORM, PostgreSQL 16 (RLS enabled), TypeScript, Jest.

## Global Constraints

- **Tenancy Isolation**: Execute all tenant queries via `TenantDbService.run(...)` or within an existing transactional `EntityManager`.
- **Error Handling**: Use `Coded*Exception` throwing `ErrorCode` from `@tiny-threads/shared`.
- **Database Safety**: Never use `app_owner` connection string for runtime queries; migrations run as `app_owner` with `NO FORCE RLS` / `FORCE RLS` brackets during structural table updates.

---

### Task 1: Database Migration & Schema Indexing

**Files:**
- Create: `apps/api/src/db/migrations/1785340000000-AddBatch4IndexesAndTenantSettings.ts`
- Test: `apps/api/src/db/__tests__/migration-order.spec.ts`

**Interfaces:**
- Consumes: PostgreSQL schema for `tenant_settings`, `orders`, `order_items`, `order_events`, `payments`, `settlements`, `refunds`, `currencies`.
- Produces: Database migration timestamp `1785340000000` adding unique constraints, currency column, FK, and performance indexes.

- [ ] **Step 1: Write the migration file**

Create `apps/api/src/db/migrations/1785340000000-AddBatch4IndexesAndTenantSettings.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBatch4IndexesAndTenantSettings1785340000000
  implements MigrationInterface
{
  name = 'AddBatch4IndexesAndTenantSettings1785340000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add default_currency_code to tenant_settings with FK to currencies(code)
    await queryRunner.query(
      `ALTER TABLE "tenant_settings" ADD COLUMN "default_currency_code" text NOT NULL DEFAULT 'USD'`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_settings" ADD CONSTRAINT "FK_tenant_settings_default_currency_code" FOREIGN KEY ("default_currency_code") REFERENCES "currencies"("code") ON UPDATE CASCADE ON DELETE RESTRICT`,
    );

    // 2. RLS-safe deduplication and unique index on tenant_settings(tenant_id)
    await queryRunner.query(
      `ALTER TABLE "tenant_settings" NO FORCE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `DELETE FROM "tenant_settings" a USING "tenant_settings" b WHERE a.tenant_id = b.tenant_id AND a.created_at > b.created_at`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_settings" FORCE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "tenant_settings_tenant_uidx" ON "tenant_settings" ("tenant_id")`,
    );

    // 3. Performance indexes on commerce tables
    await queryRunner.query(
      `CREATE INDEX "orders_tenant_customer_created_idx" ON "orders" ("tenant_id", "customer_id", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "orders_tenant_status_created_idx" ON "orders" ("tenant_id", "status", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "orders_tenant_created_idx" ON "orders" ("tenant_id", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "order_items_tenant_order_idx" ON "order_items" ("tenant_id", "order_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "order_events_tenant_order_created_idx" ON "order_events" ("tenant_id", "order_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "payments_tenant_order_status_idx" ON "payments" ("tenant_id", "order_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "settlements_tenant_payment_idx" ON "settlements" ("tenant_id", "payment_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "settlements_tenant_order_idx" ON "settlements" ("tenant_id", "order_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "refunds_tenant_payment_idx" ON "refunds" ("tenant_id", "payment_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "refunds_tenant_order_idx" ON "refunds" ("tenant_id", "order_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "refunds_tenant_order_idx"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "refunds_tenant_payment_idx"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "settlements_tenant_order_idx"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "settlements_tenant_payment_idx"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "payments_tenant_order_status_idx"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "order_events_tenant_order_created_idx"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "order_items_tenant_order_idx"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "orders_tenant_created_idx"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "orders_tenant_status_created_idx"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "orders_tenant_customer_created_idx"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "tenant_settings_tenant_uidx"`);
    await queryRunner.query(
      `ALTER TABLE "tenant_settings" DROP CONSTRAINT IF EXISTS "FK_tenant_settings_default_currency_code"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_settings" DROP COLUMN IF EXISTS "default_currency_code"`,
    );
  }
}
```

- [ ] **Step 2: Verify migration order test**

Run: `pnpm test -- migration-order.spec.ts`
Expected: PASS (migration prefix `1785340000000` is strictly ascending).

- [ ] **Step 3: Run database migration**

Run: `pnpm db:migrate`
Expected: Migration executed successfully.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/db/migrations/1785340000000-AddBatch4IndexesAndTenantSettings.ts
git commit -m "feat(api): add migration for Batch 4 indexes and tenant_settings schema enhancements"
```

---

### Task 2: Entity & DTO Refactoring

**Files:**
- Modify: `apps/api/src/db/entities/tenant-settings.entity.ts`
- Modify: `apps/api/src/db/entities/order.entity.ts`
- Modify: `apps/api/src/db/entities/order-item.entity.ts`
- Modify: `apps/api/src/db/entities/order-event.entity.ts`
- Modify: `apps/api/src/db/entities/payment.entity.ts`
- Modify: `apps/api/src/db/entities/settlement.entity.ts`
- Modify: `apps/api/src/db/entities/refund.entity.ts`
- Modify: `apps/api/src/tenant-settings/dto/update-tenant-settings.dto.ts`
- Test: `apps/api/src/tenant-settings/__tests__/tenant-settings.service.spec.ts`

**Interfaces:**
- Consumes: TypeORM Entity decorators (`@Entity`, `@Index`, `@Column`).
- Produces: Updated entity definitions with numeric transformers and `@Index` metadata matching migration index names, plus `UpdateTenantSettingsDto` supporting `defaultCurrencyCode`.

- [ ] **Step 1: Update `TenantSettings` entity**

Modify `apps/api/src/db/entities/tenant-settings.entity.ts`:
```ts
import { Entity, Column, Index } from 'typeorm';
import { TenantEntityBase } from './base';

@Index('tenant_settings_tenant_uidx', ['tenantId'], { unique: true })
@Entity({ name: 'tenant_settings' })
export class TenantSettings extends TenantEntityBase {
  @Column({ name: 'allow_guest_checkout', type: 'boolean', default: true })
  allowGuestCheckout!: boolean;

  @Column({
    name: 'platform_fee_percent',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 2.5,
    transformer: {
      to: (v: number) => v,
      from: (v: string | null) => (v === null ? v : Number(v)),
    },
  })
  platformFeePercent!: number;

  @Column({ name: 'default_currency_code', type: 'text', default: 'USD' })
  defaultCurrencyCode!: string;
}
```

- [ ] **Step 2: Add `@Index` decorators on commerce entities**

Update `Order`, `OrderItem`, `OrderEvent`, `Payment`, `Settlement`, and `Refund` entities in `apps/api/src/db/entities/` with decorators corresponding to migration indexes.

- [ ] **Step 3: Update `UpdateTenantSettingsDto`**

Modify `apps/api/src/tenant-settings/dto/update-tenant-settings.dto.ts`:
```ts
import { IsOptional, IsBoolean, IsString } from 'class-validator';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

export class UpdateTenantSettingsDto {
  @IsOptional()
  @IsBoolean({ message: field(ErrorCode.IS_BOOLEAN) })
  allowGuestCheckout?: boolean;

  @IsOptional()
  @IsString({ message: field(ErrorCode.IS_STRING) })
  defaultCurrencyCode?: string;
}
```

- [ ] **Step 4: Run build and unit tests**

Run: `pnpm build && pnpm test -- tenant-settings`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db/entities/ apps/api/src/tenant-settings/dto/
git commit -m "feat(api): update entities with index decorators, numeric transformers, and currency dto field"
```

---

### Task 3: Service & Controller Logic Updates

**Files:**
- Modify: `apps/api/src/tenant-settings/tenant-settings.service.ts`
- Modify: `apps/api/src/checkout/checkout.service.ts`
- Modify: `apps/api/src/orders/orders.service.ts`
- Modify: `apps/api/src/orders/controllers/customers-orders.controller.ts`
- Modify: `apps/api/src/orders/controllers/merchant-admins-orders.controller.ts`
- Test: `apps/api/src/checkout/__tests__/checkout.service.spec.ts`
- Test: `apps/api/src/orders/__tests__/orders.service.spec.ts`

**Interfaces:**
- Consumes: `TenantSettingsService`, `CheckoutService`, `OrdersService`, `OrderQueryDto`.
- Produces: Idempotent settings management, dynamic currency propagation during checkout, and paginated order listing endpoints.

- [ ] **Step 1: Update `TenantSettingsService`**

Modify `apps/api/src/tenant-settings/tenant-settings.service.ts`:
- Make `getSettings(manager?: EntityManager)` accept an optional `manager` parameter and insert initial settings via `.orIgnore()` (`ON CONFLICT (tenant_id) DO NOTHING`).
- Update `updateSettings` to validate `dto.defaultCurrencyCode` against the `Currency` entity table if provided.

- [ ] **Step 2: Update `CheckoutService` to use store currency**

Modify `apps/api/src/checkout/checkout.service.ts`:
- Replace hardcoded `'USD'` with `settings.defaultCurrencyCode` when constructing `Order` and `Payment`.

- [ ] **Step 3: Update `OrdersService` and controllers for pagination**

Modify `apps/api/src/orders/orders.service.ts`:
- Update `getCustomerOrders` and `getMerchantOrders` to accept `OrderQueryDto` and call `manager.findAndCount(Order, { ... })` returning `{ items, total, page, limit }`.
- Update `CustomersOrdersController` and `MerchantAdminsOrdersController` `@Get()` methods to use `@Query() query: OrderQueryDto`.

- [ ] **Step 4: Run unit tests**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tenant-settings/ apps/api/src/checkout/ apps/api/src/orders/
git commit -m "feat(api): implement idempotent tenant settings, checkout currency resolution, and paginated order queries"
```

---

### Task 4: Testing Guards & Comprehensive Verification

**Files:**
- Modify: `apps/api/src/db/__tests__/entity-metadata.spec.ts`
- Test: `apps/api/src/tenant-settings/__tests__/tenant-settings.service.spec.ts`
- Test: `apps/api/src/checkout/__tests__/checkout.service.spec.ts`
- Test: `apps/api/src/orders/__tests__/orders.service.spec.ts`

**Interfaces:**
- Consumes: Entity metadata suite and application unit/integration test suites.
- Produces: Regression guards for database indexing and verified Batch 4 remediation.

- [ ] **Step 1: Extend `entity-metadata.spec.ts`**

Update `apps/api/src/db/__tests__/entity-metadata.spec.ts`:
- Assert every tenant-scoped entity (extending `TenantEntityBase` / `ImmutableTenantEntityBase`) has at least one index defined beyond the primary key.
- Assert every composite index defined on tenant entities leads with `tenant_id` / `tenantId`.

- [ ] **Step 2: Run entity metadata test**

Run: `pnpm test -- entity-metadata.spec.ts`
Expected: PASS

- [ ] **Step 3: Run fresh database and RLS verifications**

Run: `pnpm --filter @tiny-threads/api db:verify-fresh && pnpm db:verify-rls`
Expected: PASS with 0 RLS violations.

- [ ] **Step 4: Run lint check**

Run: `pnpm lint:check`
Expected: 0 lint errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db/__tests__/entity-metadata.spec.ts
git commit -m "test(api): enforce repo-wide tenant-leading index rules in entity metadata guard"
```
