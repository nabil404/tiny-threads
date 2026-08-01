# Batch 3 — Convention & Hygiene Design Spec

Status: proposed (2026-08-01)
Scope: findings R9, R18, R19, R20, R21 from
[`api-review-remediation-plan.md`](../../plans/api-review-remediation-plan.md),
plus R16 (order list pagination) pulled in because it composes naturally with
R18's `OrderQueryDto`.

---

## 1. R9 — `UpdateTenantSettingsDto` error codes

### Problem

`UpdateTenantSettingsDto` is the only DTO in the codebase whose `class-validator`
decorators lack `message: field(ErrorCode.<NAME>)`. This breaks the
error-envelope contract — clients receive raw English strings instead of
machine-readable codes.

### Fix

Add the missing error code to the `@IsBoolean()` decorator:

```ts
@IsBoolean({ message: field(ErrorCode.IS_BOOLEAN) })
allowGuestCheckout?: boolean;
```

`IS_BOOLEAN` already exists in `ErrorCode`. `platformFeePercent` was removed by
R5 in Batch 2.

### Verification

- Existing DTO validation tests across other modules pass unchanged.
- New unit test for `UpdateTenantSettingsDto` validates that the error code
  `IS_BOOLEAN` is returned for invalid values.

---

## 2. R18 + R16 — Order status typing, query validation, and pagination

### Problem

Two gaps:

1. **Unvalidated status.** `UpdateOrderStatusDto.status` is `@IsString()` with
   no `@IsIn`. An unknown status value passes validation and hits the transition
   table's fallback, producing a misleading
   `INVALID_ORDER_STATUS_TRANSITION` error instead of a `VALIDATION_FAILED`.

2. **Unvalidated query param.** `MerchantAdminsOrdersController.getMerchantOrders`
   accepts a raw `@Query('status') status?: string` — an unknown status returns
   `200 []` (looks like "no orders") instead of `400`.

3. **No pagination.** Both `getCustomerOrders` and `getMerchantOrders` return
   every matching row with eager joins — unbounded responses.

### Fix

#### 2a. Define the status union on the entity

```ts
// src/db/entities/order.entity.ts
export const ORDER_STATUSES = [
  'pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
```

Type the `status` property on the entity as `OrderStatus`. Type the transition
table in `orders.service.ts` as `Record<OrderStatus, OrderStatus[]>`.

#### 2b. Update `UpdateOrderStatusDto`

Replace `@IsString()` with `@IsIn(ORDER_STATUSES)`:

```ts
import { ORDER_STATUSES, OrderStatus } from '../../db/entities/order.entity';

@IsIn(ORDER_STATUSES, { message: field(ErrorCode.IS_IN) })
status!: OrderStatus;
```

#### 2c. New `OrderQueryDto`

Mirror [`ProductQueryDto`](../../apps/api/src/products/dto/product-query.dto.ts)
exactly:

```ts
// src/orders/dto/order-query.dto.ts
export class OrderQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: field(ErrorCode.IS_INT) })
  @Min(1, { message: field(ErrorCode.MIN) })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: field(ErrorCode.IS_INT) })
  @Min(1, { message: field(ErrorCode.MIN) })
  @Max(100, { message: field(ErrorCode.MAX) })
  limit: number = 20;

  @IsOptional()
  @IsIn(ORDER_STATUSES, { message: field(ErrorCode.IS_IN) })
  status?: OrderStatus;
}
```

#### 2d. Update the service

- `getMerchantOrders(query: OrderQueryDto)` uses `findAndCount` with
  `skip: (query.page - 1) * query.limit`, `take: query.limit`.
- Returns `{ items, total, page, limit }` — same shape as
  `ProductsService.findAll`.
- `getCustomerOrders(customerId: string, query: OrderQueryDto)` gets the same
  treatment.
- The `where: any` becomes `FindOptionsWhere<Order>`, which also resolves 2 of
  the R19 lint errors.

#### 2e. Update the controller

`MerchantAdminsOrdersController.getMerchantOrders`:

```ts
@Get()
async getMerchantOrders(@Query() query: OrderQueryDto) {
  return this.ordersService.getMerchantOrders(query);
}
```

The customer orders controller gets the same treatment.

### Verification

- Unit tests: invalid status in `UpdateOrderStatusDto` returns `IS_IN`;
  `OrderQueryDto` validates page/limit/status bounds.
- Service tests: `getMerchantOrders` returns `{ items, total, page, limit }`;
  pagination math is correct.

---

## 3. R19 — Lint errors and CI gate

### Problem

`eslint` reports 14 errors (10 Prettier formatting, 2 `no-unsafe-*` from
`where: any` in `getMerchantOrders`, 2 `no-unnecessary-type-assertion` in
`merchant-admins-auth-error-format.e2e-spec.ts`). There is no CI gate on lint,
and the existing `lint` script uses `--fix` which hides errors from developers.

### Fix

1. **Prettier errors (10):** Resolved by running `--fix` once, or naturally when
   we format the files touched by R18.
2. **`where: any` (2):** Resolved by R18's typed `FindOptionsWhere<Order>`.
3. **Unnecessary type assertions (2):** Drop the `as string` assertions at
   `orders.e2e-spec.ts` lines 135 and 305.
4. **New `lint:check` script** in `apps/api/package.json`:

   ```json
   "lint:check": "eslint \"{src,apps,libs,test}/**/*.ts\" --max-warnings=1000"
   ```

   CI runs `lint:check` (no `--fix`, fails on any error, caps warnings at 1000).
   Local devs keep the `lint` script with `--fix`. Ratchet `--max-warnings` down
   over time.

### Verification

- `pnpm --filter @tiny-threads/api lint:check` exits 0.

---

## 4. R20 — Dead test file

### Problem

`test/orders-e2e.spec.ts` contains `import './orders.e2e-spec';`. The unit Jest
config's `rootDir` is `src`, so it never scans `test/`. The e2e config's
`testRegex` is `.e2e-spec.ts$`, so `orders-e2e.spec.ts` (ending `.spec.ts`)
doesn't match. The file is executed by no runner.

### Fix

Delete `test/orders-e2e.spec.ts`.

### Verification

- `pnpm test` and `pnpm test:e2e` pass unchanged.

---

## 5. R21 — Order expiry feature

### Problem

`Order.expiresAt` is declared on the entity and created by the migration, but is
never read or written. The `ORDER_EXPIRED` error code exists in `@tiny-threads/shared`
and is never thrown. The intent — expire unpaid `pending_payment` orders and
release their reservations — was designed but not built.

Leaving a nullable column that nothing populates looks like a working feature to
the next reader.

### Architecture

New module `src/scheduler/` — a generic home for all scheduled jobs, so future
cron work lands here rather than spawning single-purpose modules:

```
src/scheduler/
├── scheduler.module.ts
└── jobs/
    ├── order-expiry.job.ts        ← @Cron shell, only calls the service
    └── order-expiry.service.ts    ← Business logic
```

Each job gets a `.job.ts` (the `@Cron` shell) and a `.service.ts` (the business
logic). The `.job.ts` is the only `@nestjs/schedule` coupling — swapping to
BullMQ or Temporal later means replacing the `.job.ts` files only.

### 5a. Setting `expires_at`

In `CheckoutService.checkout()`, when creating the order, set:

```ts
expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
```

30 minutes is hardcoded — sufficient for typical payment flows.

### 5b. Clearing `expires_at` on payment

When an order transitions to `paid` (in `OrdersService.transitionStatus`),
clear `expiresAt`:

```ts
if (newStatus === 'paid') {
  order.expiresAt = null;
}
```

This prevents a successfully-paid order from ever being expired.

### 5c. The expiry service

`OrderExpiryService.expireStaleOrders()`:

1. **Scan tenants.** Query the global `tenants` table (no RLS) to get all tenant
   IDs. This is the only cross-tenant query — it reads the non-tenant-scoped
   `tenants` table via `DataSource` directly.

2. **Per-tenant processing.** For each tenant, call `tenantDb.run()` to
   re-establish CLS tenant context (per the backend-engineer skill's invariant
   #6: "Background jobs carry `tenantId` and re-establish tenant context in the
   worker before any DB access").

3. **Find expired orders.** Within the tenant transaction, query:

   ```ts
   const expired = await manager.find(Order, {
     where: {
       status: 'pending_payment',
       expiresAt: LessThanOrEqual(new Date()),
     },
     relations: { items: true },
     lock: { mode: 'pessimistic_write' },    // FOR UPDATE
     // Note: TypeORM doesn't support SKIP LOCKED natively.
     // Use a raw query or queryBuilder if overlap safety is needed.
   });
   ```

   Alternatively, use QueryBuilder for `SKIP LOCKED`:

   ```ts
   const expired = await manager
     .createQueryBuilder(Order, 'order')
     .leftJoinAndSelect('order.items', 'items')
     .where('order.status = :status', { status: 'pending_payment' })
     .andWhere('order.expiresAt <= :now', { now: new Date() })
     .setLock('pessimistic_write', undefined, ['order'])
     .setOnLocked('skip_locked')
     .getMany();
   ```

4. **Cancel each expired order.** Reuse the existing
   `OrdersService.cancelOrderSideEffects()` pattern — restores stock, refunds if
   payment was captured (unlikely for `pending_payment`, but safe).

   Then set `order.status = 'cancelled'`, save, and record an `OrderEvent` with
   `eventType: 'order_expired'` and `actorType: 'system'`.

### 5d. The scheduler

```ts
// scheduler/jobs/order-expiry.job.ts
@Injectable()
export class OrderExpiryJob {
  constructor(private readonly orderExpiryService: OrderExpiryService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleExpiry(): Promise<void> {
    await this.orderExpiryService.expireStaleOrders();
  }
}
```

The `@Cron` decorator is the only `@nestjs/schedule` coupling. The service knows
nothing about cron.

### 5e. Module wiring

```ts
// scheduler/scheduler.module.ts
@Module({
  imports: [ScheduleModule.forRoot(), OrdersModule],
  providers: [OrderExpiryService, OrderExpiryJob],
})
export class SchedulerModule {}
```

Future jobs are added to `providers` alongside their services. If the module
grows large, split into per-job sub-modules imported by `SchedulerModule`.

`OrderExpiryService` injects `TenantDbService` (from `DbModule`) and
`DataSource` (for the global tenants query only). It also needs access to the
`cancelOrderSideEffects` logic.

**Decision:** Make `cancelOrderSideEffects` public on `OrdersService`.
`OrderExpiryService` already depends on `OrdersModule` via its imports, so no
circular dependency arises. Extracting a separate `OrderCancellationService` adds
a file for no structural benefit — revisit if `OrdersService` grows too large
(currently ~300 lines).

### 5f. New dependency

Add `@nestjs/schedule` to `apps/api`:

```bash
pnpm --filter @tiny-threads/api add @nestjs/schedule
```

### Verification

- **Unit test:** Mock the clock, assert that orders with `expiresAt` in the past
  are cancelled, stock is restored, and an `order_expired` event is recorded.
  Assert that orders with `expiresAt` in the future are untouched.
- **Unit test:** Assert that `expires_at` is set on order creation in checkout.
- **Unit test:** Assert that `expires_at` is cleared when order transitions to
  `paid`.
- **Integration test:** Assert the scheduler calls `expireStaleOrders` on the
  cron schedule (mock the service, verify invocation).

---

## Summary of changes

| Finding | Files modified | Files created | Files deleted |
|---------|---------------|---------------|---------------|
| R9 | `tenant-settings/dto/update-tenant-settings.dto.ts` | — | — |
| R18+R16 | `order.entity.ts`, `update-order-status.dto.ts`, `orders.service.ts`, `merchant-admins-orders.controller.ts`, customer orders controller | `orders/dto/order-query.dto.ts` | — |
| R19 | `merchant-admins-auth-error-format.e2e-spec.ts`, `package.json`, various (Prettier auto-fix) | — | — |
| R20 | — | — | `test/orders-e2e.spec.ts` |
| R21 | `checkout.service.ts`, `orders.service.ts` | `scheduler/` module (3 files) | — |

### New dependency

- `@nestjs/schedule` (for the order expiry cron job)

### Breaking changes

- `getMerchantOrders` and `getCustomerOrders` return
  `{ items, total, page, limit }` instead of a flat array. No external consumers
  exist — `apps/web` has no storefront UI for order listing yet.
