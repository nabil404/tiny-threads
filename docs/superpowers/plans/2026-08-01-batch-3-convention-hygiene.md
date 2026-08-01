# Batch 3 — Convention & Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix convention violations (R9, R18, R19, R20), add order list pagination (R16), and build the order expiry feature (R21).

**Architecture:** Five findings plus one pulled-in feature (R16). Tasks 1–3 are independent hygiene fixes. Task 4 adds the `OrderStatus` type and paginated query DTO that R18 and R16 require. Task 5 builds the order expiry scheduler module. Task 6 wires everything together and verifies.

**Tech Stack:** NestJS 11, TypeORM, class-validator, `@nestjs/schedule`, PostgreSQL

## Global Constraints

- All DTOs use `message: field(ErrorCode.<NAME>)` on every `class-validator` decorator — never bare decorators.
- All tenant-scoped DB access goes through `TenantDbService.run()`; background jobs re-establish tenant context per invariant #6.
- Follow existing pagination pattern from `ProductQueryDto` / `ProductsService.findAll`.
- Commit after each task.

---

### Task 1: R9 + R20 — Fix tenant settings DTO and delete dead test file

**Files:**
- Modify: `apps/api/src/tenant-settings/dto/update-tenant-settings.dto.ts:1-12`
- Delete: `apps/api/test/orders-e2e.spec.ts`

**Interfaces:**
- Consumes: `ErrorCode.IS_BOOLEAN` from `@tiny-threads/shared`, `field()` from `common/errors/validation-field`
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Add error code to `UpdateTenantSettingsDto`**

Replace the entire file:

```ts
// apps/api/src/tenant-settings/dto/update-tenant-settings.dto.ts
import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';

export class UpdateTenantSettingsDto {
  @ApiPropertyOptional({
    description: 'Whether guest checkout is enabled for the tenant storefront.',
    example: true,
  })
  @IsOptional()
  @IsBoolean({ message: field(ErrorCode.IS_BOOLEAN) })
  allowGuestCheckout?: boolean;
}
```

- [ ] **Step 2: Delete dead test file**

```bash
rm apps/api/test/orders-e2e.spec.ts
```

- [ ] **Step 3: Verify tests still pass**

Run: `cd apps/api && pnpm test --passWithNoTests 2>&1 | tail -5`
Expected: all existing tests pass, no change in count.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "fix(api): add error codes to UpdateTenantSettingsDto (R9) and delete dead test file (R20)"
```

---

### Task 2: R19 — Fix lint errors and add lint:check script

**Files:**
- Modify: `apps/api/test/orders.e2e-spec.ts:135,305`
- Modify: `apps/api/src/db/__tests__/migration-order.spec.ts` (Prettier auto-fix)
- Modify: `apps/api/src/orders/controllers/guest-orders.controller.ts` (Prettier auto-fix)
- Modify: `apps/api/src/orders/controllers/customers-orders.controller.ts` (Prettier auto-fix)
- Modify: `apps/api/src/orders/controllers/merchant-admins-orders.controller.ts` (Prettier auto-fix)
- Modify: `apps/api/package.json:15`

**Interfaces:**
- Consumes: nothing
- Produces: `lint:check` script in `package.json`

- [ ] **Step 1: Fix the two unnecessary type assertions in `orders.e2e-spec.ts`**

At line 135, change:
```ts
// Before:
    const sessionId = cartRes.headers['x-guest-session-id'] as string;
// After:
    const sessionId = cartRes.headers['x-guest-session-id'];
```

At line 305, the same change:
```ts
// Before:
    const sessionId = cartRes.headers['x-guest-session-id'] as string;
// After:
    const sessionId = cartRes.headers['x-guest-session-id'];
```

- [ ] **Step 2: Run Prettier auto-fix on files with formatting errors**

```bash
cd apps/api && npx prettier --write \
  src/db/__tests__/migration-order.spec.ts \
  src/orders/controllers/guest-orders.controller.ts \
  src/orders/controllers/customers-orders.controller.ts \
  src/orders/controllers/merchant-admins-orders.controller.ts
```

Note: The remaining 2 `no-unsafe-*` errors in `orders.service.ts:252,256` (`where: any`) will be fixed by Task 4 (R18) when we type the `where` clause.

- [ ] **Step 3: Add `lint:check` script to `package.json`**

In `apps/api/package.json`, after line 15 (`"lint": "eslint ..."`), add:

```json
    "lint:check": "eslint \"{src,apps,libs,test}/**/*.ts\" --max-warnings=1000",
```

- [ ] **Step 4: Verify lint:check passes (except the 2 errors Task 4 will fix)**

```bash
cd apps/api && npx eslint "{src,test}/**/*.ts" --no-fix --format json 2>/dev/null | python3 -c "import json,sys; data=json.load(sys.stdin); errors=[m for r in data for m in r['messages'] if m['severity']==2]; print(f'{len(errors)} errors remaining')"
```

Expected: 2 errors remaining (the `no-unsafe-*` in `orders.service.ts` that Task 4 fixes).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "fix(api): fix lint errors and add lint:check script (R19)"
```

---

### Task 3: R18 + R16 — OrderStatus type, query DTO, and paginated list endpoints

**Files:**
- Modify: `apps/api/src/db/entities/order.entity.ts:1-39`
- Modify: `apps/api/src/orders/dto/update-order-status.dto.ts:1-13`
- Create: `apps/api/src/orders/dto/order-query.dto.ts`
- Modify: `apps/api/src/orders/orders.service.ts:18-23,33-37,64,99,108,217-261`
- Modify: `apps/api/src/orders/controllers/merchant-admins-orders.controller.ts:41-43`
- Modify: `apps/api/src/orders/controllers/customers-orders.controller.ts:1,26-28`

**Interfaces:**
- Consumes: `ErrorCode.IS_IN`, `ErrorCode.IS_INT`, `ErrorCode.MIN`, `ErrorCode.MAX` from `@tiny-threads/shared`; `field()` from `common/errors/validation-field`
- Produces: `OrderStatus` type, `ORDER_STATUSES` const (consumed by Task 5); paginated return type `{ items: Order[]; total: number; page: number; limit: number }` from `getMerchantOrders` and `getCustomerOrders`

- [ ] **Step 1: Add `OrderStatus` type to the entity**

In `apps/api/src/db/entities/order.entity.ts`, add the status constants before the `@Entity` decorator and type the `status` property:

```ts
import { Entity, Column, OneToMany } from 'typeorm';
import { TenantEntityBase } from './base';
import { OrderItem } from './order-item.entity';

export const ORDER_STATUSES = [
  'pending_payment',
  'paid',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

@Entity({ name: 'orders' })
export class Order extends TenantEntityBase {
  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId?: string;

  @Column({ name: 'customer_email', type: 'varchar' })
  customerEmail!: string;

  @Column({ name: 'status', type: 'varchar', default: 'pending_payment' })
  status!: OrderStatus;

  @Column({ name: 'payment_status', type: 'varchar', default: 'pending' })
  paymentStatus!: string;

  @Column({ name: 'currency_code', type: 'varchar', default: 'USD' })
  currencyCode!: string;

  @Column({ name: 'total_cents', type: 'integer' })
  totalCents!: number;

  @Column({ name: 'shipping_address', type: 'jsonb' })
  shippingAddress!: Record<string, any>;

  @Column({ name: 'billing_address', type: 'jsonb', nullable: true })
  billingAddress?: Record<string, any>;

  @Column({ name: 'guest_access_token_hash', type: 'varchar', nullable: true })
  guestAccessTokenHash?: string;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt?: Date | null;

  @OneToMany(() => OrderItem, (item) => item.order)
  items?: OrderItem[];
}
```

Note: `expiresAt` type changed to `Date | null` to support explicit nulling in Task 5.

- [ ] **Step 2: Update `UpdateOrderStatusDto`**

Replace `apps/api/src/orders/dto/update-order-status.dto.ts`:

```ts
import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';
import {
  ORDER_STATUSES,
  type OrderStatus,
} from '../../db/entities/order.entity';

export class UpdateOrderStatusDto {
  @ApiProperty({
    description: 'New order status',
    example: 'shipped',
    enum: ORDER_STATUSES,
  })
  @IsIn([...ORDER_STATUSES], { message: field(ErrorCode.IS_IN) })
  status!: OrderStatus;
}
```

- [ ] **Step 3: Create `OrderQueryDto`**

Create `apps/api/src/orders/dto/order-query.dto.ts`:

```ts
import { IsOptional, IsIn, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/validation-field';
import {
  ORDER_STATUSES,
  type OrderStatus,
} from '../../db/entities/order.entity';

export class OrderQueryDto {
  @ApiPropertyOptional({ description: 'Page number', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: field(ErrorCode.IS_INT) })
  @Min(1, { message: field(ErrorCode.MIN) })
  page: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page (max 100)',
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: field(ErrorCode.IS_INT) })
  @Min(1, { message: field(ErrorCode.MIN) })
  @Max(100, { message: field(ErrorCode.MAX) })
  limit: number = 20;

  @ApiPropertyOptional({
    description: 'Filter by order status',
    enum: ORDER_STATUSES,
  })
  @IsOptional()
  @IsIn([...ORDER_STATUSES], { message: field(ErrorCode.IS_IN) })
  status?: OrderStatus;
}
```

- [ ] **Step 4: Update `OrdersService` — type transition table, add pagination to list methods**

In `apps/api/src/orders/orders.service.ts`, make these changes:

**4a.** Add imports at the top (line 1–16 area):

```ts
import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { EntityManager, FindOptionsWhere } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { ErrorCode } from '@tiny-threads/shared';
import { TenantDbService } from '../db/tenant-db.service';
import { PaymentsService } from '../payments/payments.service';
import { Order, OrderStatus } from '../db/entities/order.entity';
import { OrderEvent } from '../db/entities/order-event.entity';
import { ProductVariant } from '../db/entities/product-variants.entity';
import { Refund } from '../db/entities/refund.entity';
import { RefundOrderDto } from './dto/refund-order.dto';
import { OrderQueryDto } from './dto/order-query.dto';
import {
  CodedBadRequestException,
  CodedNotFoundException,
} from '../common/errors/coded-exceptions';
```

**4b.** Type the transition table (line 18–23):

```ts
const VALID_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  pending_payment: ['paid', 'cancelled'],
  paid: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
};
```

**4c.** Type the `transitionStatus` signature (line 33–37):

```ts
  async transitionStatus(
    orderId: string,
    newStatus: OrderStatus,
    actorType: string,
    actorId?: string,
  ): Promise<Order> {
```

**4d.** Type the status assignments. At line 64:

```ts
      order.status = newStatus;
```

At line 99 (`customerCancelOrder`):

```ts
      if (order.status !== 'pending_payment') {
```

At line 108:

```ts
      order.status = 'cancelled';
```

These already compile because `OrderStatus` includes all these literal values — no code change needed, just the type now enforces it.

**4e.** Replace `getCustomerOrders` (lines 217–225):

```ts
  async getCustomerOrders(
    customerId: string,
    query: OrderQueryDto,
  ): Promise<{ items: Order[]; total: number; page: number; limit: number }> {
    return this.tenantDb.run(async (manager) => {
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;

      const where: FindOptionsWhere<Order> = { customerId };
      if (query.status) {
        where.status = query.status;
      }

      const [items, total] = await manager.findAndCount(Order, {
        where,
        relations: { items: true },
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });

      return { items, total, page, limit };
    });
  }
```

**4f.** Replace `getMerchantOrders` (lines 248–261):

```ts
  async getMerchantOrders(
    query: OrderQueryDto,
  ): Promise<{ items: Order[]; total: number; page: number; limit: number }> {
    return this.tenantDb.run(async (manager) => {
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;

      const where: FindOptionsWhere<Order> = {};
      if (query.status) {
        where.status = query.status;
      }

      const [items, total] = await manager.findAndCount(Order, {
        where,
        relations: { items: true },
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });

      return { items, total, page, limit };
    });
  }
```

**4g.** Make `cancelOrderSideEffects` public (line 288) — needed by Task 5:

```ts
  async cancelOrderSideEffects(
```

(Remove the `private` keyword.)

- [ ] **Step 5: Update controllers**

**5a.** `MerchantAdminsOrdersController` — replace the `getMerchantOrders` method and add import:

At the top, add import:
```ts
import { OrderQueryDto } from '../dto/order-query.dto';
```

Replace the method (lines 40–43):
```ts
  @Get()
  async getMerchantOrders(@Query() query: OrderQueryDto) {
    return this.ordersService.getMerchantOrders(query);
  }
```

**5b.** `CustomersOrdersController` — add `Query` to imports and update `getCustomerOrders`:

At line 1, add `Query` to the import:
```ts
import { Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
```

Add import:
```ts
import { OrderQueryDto } from '../dto/order-query.dto';
```

Replace the method (lines 26–28):
```ts
  async getCustomerOrders(@Req() req: Request, @Query() query: OrderQueryDto) {
    const { sub: customerId } = req.user as CustomerAccessTokenPayload;
    return this.ordersService.getCustomerOrders(customerId, query);
  }
```

- [ ] **Step 6: (No existing unit tests call getMerchantOrders/getCustomerOrders directly — skip)**

- [ ] **Step 7: Verify build and tests**

```bash
cd /Users/nabilnms/Projects/tiny-threads && pnpm build && pnpm test 2>&1 | tail -10
```

Expected: build passes, all tests pass.

- [ ] **Step 8: Verify lint errors are resolved**

```bash
cd apps/api && npx eslint "{src,test}/**/*.ts" --no-fix --format json 2>/dev/null | python3 -c "import json,sys; data=json.load(sys.stdin); errors=[m for r in data for m in r['messages'] if m['severity']==2]; print(f'{len(errors)} errors remaining')"
```

Expected: 0 errors.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat(api): add OrderStatus type, OrderQueryDto with pagination, and validate status params (R18, R16)"
```

---

### Task 4: R21 — Set and clear `expires_at` on orders

**Files:**
- Modify: `apps/api/src/checkout/checkout.service.ts:124-135`
- Modify: `apps/api/src/orders/orders.service.ts:60-65`

**Interfaces:**
- Consumes: `Order.expiresAt` property (already on the entity)
- Produces: Orders created by checkout have `expiresAt` set 30 minutes in the future; orders transitioned to `paid` have `expiresAt` cleared to `null`

- [ ] **Step 1: Set `expiresAt` on order creation in checkout**

In `apps/api/src/checkout/checkout.service.ts`, in the `manager.create(Order, {...})` call (line 124–135), add `expiresAt` after `guestAccessTokenHash`:

```ts
      const order = manager.create(Order, {
        tenantId: effectiveTenantId,
        customerId: customerId ?? undefined,
        customerEmail: dto.customerEmail,
        status: 'pending_payment',
        paymentStatus: 'pending',
        currencyCode: 'USD',
        totalCents,
        shippingAddress: dto.shippingAddress,
        billingAddress: dto.billingAddress ?? dto.shippingAddress,
        guestAccessTokenHash: guestTokenHash ?? undefined,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
      });
```

- [ ] **Step 2: Clear `expiresAt` when order transitions to `paid`**

In `apps/api/src/orders/orders.service.ts`, in the `transitionStatus` method, after the cancellation side-effects block (around line 62) and before `order.status = newStatus` (line 64), add:

```ts
      // A paid order must never be expired by the scheduler.
      if (newStatus === 'paid') {
        order.expiresAt = null;
      }
```

- [ ] **Step 3: Also clear `expiresAt` in checkout's inline payment capture**

In `apps/api/src/checkout/checkout.service.ts`, in the `if (paymentResult.payment.status === 'captured')` block (line 177–190), add `expiresAt: null` to the save:

```ts
      if (paymentResult.payment.status === 'captured') {
        savedOrder.status = 'paid';
        savedOrder.paymentStatus = 'captured';
        savedOrder.expiresAt = null;
        await manager.save(Order, savedOrder);
```

- [ ] **Step 4: Verify build**

```bash
cd /Users/nabilnms/Projects/tiny-threads && pnpm build 2>&1 | tail -3
```

Expected: build passes.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(api): set expires_at on order creation and clear on payment (R21 prep)"
```

---

### Task 5: R21 — Order expiry scheduler module

**Files:**
- Create: `apps/api/src/scheduler/scheduler.module.ts`
- Create: `apps/api/src/scheduler/jobs/order-expiry.service.ts`
- Create: `apps/api/src/scheduler/jobs/order-expiry.job.ts`
- Modify: `apps/api/src/app/app.module.ts:21-22,41-42`

**Interfaces:**
- Consumes: `TenantDbService.run()` from `db/tenant-db.service`; `DataSource` (for global `tenants` query); `OrdersService.cancelOrderSideEffects()` (made public in Task 3); `Order`, `OrderEvent` entities; `Tenant` entity
- Produces: `OrderExpiryService.expireStaleOrders()` — called by the cron job every 5 minutes

- [ ] **Step 1: Install `@nestjs/schedule`**

```bash
cd /Users/nabilnms/Projects/tiny-threads && pnpm --filter @tiny-threads/api add @nestjs/schedule
```

- [ ] **Step 2: Create `order-expiry.service.ts`**

Create `apps/api/src/scheduler/jobs/order-expiry.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { DataSource, LessThanOrEqual } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { TenantDbService } from '../../db/tenant-db.service';
import { OrdersService } from '../../orders/orders.service';
import { Order } from '../../db/entities/order.entity';
import { OrderEvent } from '../../db/entities/order-event.entity';
import { Tenant } from '../../db/entities/tenants.entity';

@Injectable()
export class OrderExpiryService {
  private readonly logger = new Logger(OrderExpiryService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cls: ClsService,
    private readonly tenantDb: TenantDbService,
    private readonly ordersService: OrdersService,
  ) {}

  /**
   * Scans all tenants for pending_payment orders whose expires_at has
   * passed, cancels them (restoring stock and refunding if needed), and
   * records an order_expired event.
   *
   * Each tenant is processed in its own CLS context + transaction with
   * tenant context re-established, per the backend-engineer skill's
   * invariant #6: "Background jobs carry tenantId and re-establish tenant
   * context in the worker before any DB access."
   */
  async expireStaleOrders(): Promise<void> {
    // tenants is a global table (no RLS), so DataSource is fine here.
    const tenants = await this.dataSource.getRepository(Tenant).find();

    for (const tenant of tenants) {
      try {
        await this.expireOrdersForTenant(tenant.id);
      } catch (error) {
        // Log and continue — one tenant's failure must not block others.
        this.logger.error(
          `Failed to expire orders for tenant ${tenant.id}: ${error}`,
        );
      }
    }
  }

  private async expireOrdersForTenant(tenantId: string): Promise<void> {
    // withTenant (called by tenantDb.run) reads tenantId from CLS and
    // throws if absent. Background jobs have no HTTP request, so CLS is
    // empty. We create a fresh CLS context and populate it ourselves.
    await this.cls.run(async () => {
      this.cls.set('tenantId', tenantId);

      await this.tenantDb.run(async (manager) => {
        const now = new Date();

        const expiredOrders = await manager.find(Order, {
          where: {
            status: 'pending_payment',
            expiresAt: LessThanOrEqual(now),
          },
          relations: { items: true },
        });

        if (expiredOrders.length === 0) return;

        this.logger.log(
          `Expiring ${expiredOrders.length} order(s) for tenant ${tenantId}`,
        );

        for (const order of expiredOrders) {
          await this.ordersService.cancelOrderSideEffects(
            manager,
            order,
            'system',
          );

          order.status = 'cancelled';
          order.expiresAt = null;
          await manager.save(Order, order);

          const event = manager.create(OrderEvent, {
            tenantId,
            orderId: order.id,
            eventType: 'order_expired',
            actorType: 'system',
          });
          await manager.save(OrderEvent, event);
        }
      });
    });
  }
}
```

- [ ] **Step 2b: (Resolved — no action needed)**

`withTenant()` reads `tenantId` from CLS. The service uses `cls.run()` to create a fresh CLS context and sets `tenantId` before calling `tenantDb.run()`. This is confirmed by reading [`tenant-db.ts`](file:///Users/nabilnms/Projects/tiny-threads/apps/api/src/db/tenant-db.ts) — line 12: `const tenantId = cls.get<string>('tenantId')`.

- [ ] **Step 3: Create `order-expiry.job.ts`**

Create `apps/api/src/scheduler/jobs/order-expiry.job.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrderExpiryService } from './order-expiry.service';

@Injectable()
export class OrderExpiryJob {
  private readonly logger = new Logger(OrderExpiryJob.name);

  constructor(private readonly orderExpiryService: OrderExpiryService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleExpiry(): Promise<void> {
    this.logger.log('Running order expiry check...');
    await this.orderExpiryService.expireStaleOrders();
    this.logger.log('Order expiry check complete.');
  }
}
```

- [ ] **Step 4: Create `scheduler.module.ts`**

Create `apps/api/src/scheduler/scheduler.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from '../db/database.module';
import { OrdersModule } from '../orders/orders.module';
import { OrderExpiryService } from './jobs/order-expiry.service';
import { OrderExpiryJob } from './jobs/order-expiry.job';

@Module({
  imports: [ScheduleModule.forRoot(), DatabaseModule, OrdersModule],
  providers: [OrderExpiryService, OrderExpiryJob],
})
export class SchedulerModule {}
```

- [ ] **Step 5: Register `SchedulerModule` in `AppModule`**

In `apps/api/src/app/app.module.ts`:

Add import at top (after line 21):
```ts
import { SchedulerModule } from '../scheduler/scheduler.module';
```

Add to the `imports` array (after `OrdersModule` on line 41):
```ts
    SchedulerModule,
```

- [ ] **Step 6: Verify build**

```bash
cd /Users/nabilnms/Projects/tiny-threads && pnpm build 2>&1 | tail -5
```

Expected: build passes.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(api): add scheduler module with order expiry job (R21)"
```

---

### Task 6: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/nabilnms/Projects/tiny-threads && pnpm test 2>&1 | tail -15
```

Expected: all tests pass.

- [ ] **Step 2: Verify build**

```bash
pnpm build 2>&1 | tail -5
```

Expected: build passes.

- [ ] **Step 3: Verify lint:check**

```bash
pnpm --filter @tiny-threads/api lint:check 2>&1 | tail -5
```

Expected: exits 0 (0 errors, warnings under 1000 cap).

- [ ] **Step 4: Run lint with auto-fix to format everything consistently**

```bash
pnpm --filter @tiny-threads/api lint 2>&1 | tail -5
```

- [ ] **Step 5: Final commit if any formatting changes**

```bash
git diff --stat
# If changes exist:
git add -A && git commit -m "style(api): auto-format after batch 3 changes"
```
