# Technical Design: API Review Remediation — Batch 4 (Schema Quality & API Shape)

**Date**: 2026-08-01  
**Status**: Approved  
**Scope**: Remediation of findings R14, R15, R16, R17 from `docs/plans/api-review-remediation-plan.md`  

---

## 1. Overview & Objectives

Batch 4 focuses on database performance, tenant settings schema integrity, order list pagination, and dynamic currency handling.

Key Objectives:
- **R14 (Performance Indexes)**: Add tenant-leading composite indexes to all 7 commerce tables (`orders`, `order_items`, `order_events`, `payments`, `settlements`, `refunds`, `tenant_settings`) and update entity `@Index` definitions. Enforce repo-wide via an entity metadata test guard.
- **R15 (Tenant Settings Singleton & Type Fix)**: Restrict `tenant_settings` to a singleton per tenant using a `UNIQUE (tenant_id)` index. Handle RLS safety during migration deduplication (`NO FORCE` -> `DELETE` -> `FORCE`). Make `getSettings()` idempotent using `.orIgnore()`. Fix TypeORM `numeric` column transformation so `platformFeePercent` returns a JavaScript `number`.
- **R16 (Order Pagination)**: Wire `OrderQueryDto` across customer and merchant order list endpoints, returning the standardized `{ items, total, page, limit }` pagination envelope.
- **R17 (Dynamic Currency)**: Add `default_currency_code` (FK to `currencies(code)`, default `'USD'`) to `tenant_settings`. Expose optional updates in `UpdateTenantSettingsDto` and use tenant setting currency in `CheckoutService` instead of hardcoded `'USD'`.

---

## 2. Architecture & Components

```
+-------------------------------------------------------------------------------+
|                                TenantSettings                                 |
| - unique index (tenant_id)                                                    |
| - default_currency_code (FK currencies.code)                                  |
| - platform_fee_percent numeric transformer (string -> number)                |
+-------------------------------------------------------------------------------+
                                       |
                   +-------------------+-------------------+
                   |                                       |
                   v                                       v
      +------------------------+              +------------------------+
      |  TenantSettingsService |              |    CheckoutService     |
      | - getSettings()        |              | - reads tenant currency|
      |   (idempotent insert)  |------------->| - stamps currency on   |
      | - updateSettings()     |              |   Order & Payment      |
      +------------------------+              +------------------------+

+-------------------------------------------------------------------------------+
|                                 OrdersService                                 |
| - getCustomerOrders(query: OrderQueryDto) -> { items, total, page, limit }   |
| - getMerchantOrders(query: OrderQueryDto) -> { items, total, page, limit }   |
+-------------------------------------------------------------------------------+
```

---

## 3. Database Migration & Schema Changes

### Migration: `apps/api/src/db/migrations/1785340000000-AddBatch4IndexesAndTenantSettings.ts`

#### 1. `tenant_settings` Singleton & Currency Column
- **Add Column & FK**:
  ```sql
  ALTER TABLE "tenant_settings"
    ADD COLUMN "default_currency_code" text NOT NULL DEFAULT 'USD';

  ALTER TABLE "tenant_settings"
    ADD CONSTRAINT "FK_tenant_settings_default_currency_code"
    FOREIGN KEY ("default_currency_code") REFERENCES "currencies"("code")
    ON UPDATE CASCADE ON DELETE RESTRICT;
  ```
- **RLS-Safe Deduplication & Unique Index**:
  ```sql
  ALTER TABLE "tenant_settings" NO FORCE ROW LEVEL SECURITY;

  DELETE FROM "tenant_settings" a
   USING "tenant_settings" b
   WHERE a.tenant_id = b.tenant_id
     AND a.created_at > b.created_at;

  ALTER TABLE "tenant_settings" FORCE ROW LEVEL SECURITY;

  CREATE UNIQUE INDEX "tenant_settings_tenant_uidx"
    ON "tenant_settings" ("tenant_id");
  ```

#### 2. Tenant-Leading Performance Indexes
```sql
CREATE INDEX "orders_tenant_customer_created_idx"
  ON "orders" ("tenant_id", "customer_id", "created_at" DESC);

CREATE INDEX "orders_tenant_status_created_idx"
  ON "orders" ("tenant_id", "status", "created_at" DESC);

CREATE INDEX "orders_tenant_created_idx"
  ON "orders" ("tenant_id", "created_at" DESC);

CREATE INDEX "order_items_tenant_order_idx"
  ON "order_items" ("tenant_id", "order_id");

CREATE INDEX "order_events_tenant_order_created_idx"
  ON "order_events" ("tenant_id", "order_id", "created_at");

CREATE INDEX "payments_tenant_order_status_idx"
  ON "payments" ("tenant_id", "order_id", "status");

CREATE INDEX "settlements_tenant_payment_idx"
  ON "settlements" ("tenant_id", "payment_id");

CREATE INDEX "settlements_tenant_order_idx"
  ON "settlements" ("tenant_id", "order_id");

CREATE INDEX "refunds_tenant_payment_idx"
  ON "refunds" ("tenant_id", "payment_id");

CREATE INDEX "refunds_tenant_order_idx"
  ON "refunds" ("tenant_id", "order_id");
```

---

## 4. Domain & Entity Model Changes

### 1. `TenantSettings` Entity (`apps/api/src/db/entities/tenant-settings.entity.ts`)
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

### 2. Entity `@Index` Decorators
Add `@Index` decorators to entity files (`Order`, `OrderItem`, `OrderEvent`, `Payment`, `Settlement`, `Refund`) matching the SQL migration indexes.

---

## 5. DTO & API Layer Changes

### 1. `UpdateTenantSettingsDto` (`apps/api/src/tenant-settings/dto/update-tenant-settings.dto.ts`)
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

### 2. `Orders` API Controllers & Queries
- `CustomersOrdersController` and `MerchantAdminsOrdersController`: Annotate `@Get()` handlers with `@Query() query: OrderQueryDto`.
- Return envelope: `{ items: Order[], total: number, page: number, limit: number }`.

---

## 6. Service Implementation Details

### 1. `TenantSettingsService` (`apps/api/src/tenant-settings/tenant-settings.service.ts`)
- Idempotent `getSettings(manager?: EntityManager)` using `createQueryBuilder().insert().values(...).orIgnore().execute()`.
- Support optional `manager?: EntityManager` so transactional callers pass their transaction manager without deadlocking connection pool.
- Validate `dto.defaultCurrencyCode` against `Currency` repository when updating settings.

### 2. `CheckoutService` (`apps/api/src/checkout/checkout.service.ts`)
- Set `order.currencyCode = settings.defaultCurrencyCode` and `payment.currencyCode = settings.defaultCurrencyCode`.

### 3. `OrdersService` (`apps/api/src/orders/orders.service.ts`)
- Update `getCustomerOrders` and `getMerchantOrders` to accept `query: OrderQueryDto` and execute `findAndCount` with `skip: (page - 1) * limit` and `take: limit`.

---

## 7. Testing & Verification

1. **Entity Metadata Guard (`src/db/__tests__/entity-metadata.spec.ts`)**:
   - Assert all tenant-scoped tables declare at least one non-PK index.
   - Assert all composite indexes lead with `tenant_id` / `tenantId`.
2. **`TenantSettingsService` Spec**:
   - Test concurrent initial `getSettings()` requests yield 1 row.
   - Test `platformFeePercent` is returned as a number type.
   - Test valid and invalid currency code updates.
3. **`CheckoutService` Spec**:
   - Assert store's configured currency code is stamped on created `Order` and `Payment`.
4. **`OrdersService` Spec**:
   - Assert paginated order responses match `{ items, total, page, limit }`.
5. **Fresh Database Verification**:
   - Run `pnpm --filter @tiny-threads/api db:verify-fresh` and `pnpm db:verify-rls`.

---

## 8. Commit & Review

- Save spec to `docs/superpowers/specs/2026-08-01-api-remediation-batch-4-design.md`.
- Commit design document to git.
