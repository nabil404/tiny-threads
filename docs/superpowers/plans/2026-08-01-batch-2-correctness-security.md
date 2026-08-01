# Batch 2 — Correctness and Security Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve 7 correctness and security vulnerabilities in the commerce engine: checkout transaction deadlocks, cart checkout IDOR, unbounded merchant platform fee manipulation, negative/fractional refunds, unrefunded order cancellations, stock restoration race conditions, and timing attacks on guest order tokens.

**Architecture:** Un-nests transaction calls in checkout by fetching tenant settings beforehand and supporting an optional `EntityManager` in `TenantSettingsService`; derives cart ownership strictly from customer JWT or guest session header in `CheckoutController`; removes `platformFeePercent` from merchant mutation DTOs while defending bounds in money math; enforces `@IsInt()` + `@Min(1)` on refunds; automatically triggers payment refund when cancelling paid orders; applies pessimistic write locks and deterministic variant ordering during stock restoration; and uses `crypto.timingSafeEqual` for guest token verification.

**Tech Stack:** NestJS 11, TypeORM 1.1, PostgreSQL 16, Class Validator, Node.js `crypto`, Jest.

## Global Constraints

- `checkoutService.checkout` must invoke `tenantDb.run` exactly once per call and read settings prior to transaction start.
- `CheckoutDto` must not accept a client-supplied `cartId`; cart identity must be derived via `activeCartWhere(customerId, guestSessionId)`.
- `UpdateTenantSettingsDto` must not expose `platformFeePercent`. `processOrderPayment` must reject fees outside `[0, 100]`.
- `RefundOrderDto` must enforce positive integer `amountCents` via `@IsInt()` and `@Min(1)`.
- Transitioning an order with `paymentStatus === 'captured'` to status `'cancelled'` must invoke `paymentsService.refundPayment` within the same transaction and set `paymentStatus = 'refunded'`.
- `restoreStockForOrder` must accept `manager: EntityManager`, sort items by `variantId`, and lock variants with `{ mode: 'pessimistic_write' }`.
- `OrdersService.getGuestOrder` must compare hashed guest tokens using `crypto.timingSafeEqual`.

---

### Task 1: Fix Connection Pool Deadlock & Un-nest Transactions (R3)

**Files:**
- Modify: `apps/api/src/db/database.module.ts`
- Modify: `apps/api/src/tenant-settings/tenant-settings.service.ts`
- Modify: `apps/api/src/checkout/checkout.service.ts`
- Test: `apps/api/src/checkout/__tests__/checkout.service.spec.ts` (or existing unit tests)

**Interfaces:**
- Consumes: `TenantSettingsService.getSettings(manager?: EntityManager)`
- Produces: Single-transaction checkout execution without connection pool nesting.

- [ ] **Step 1: Write failing unit test for single `tenantDb.run` call in checkout**

Add test in `apps/api/src/checkout/__tests__/checkout.service.spec.ts` (or update existing test suite):
```ts
it('should open exactly one tenantDb.run per checkout call, never nested', async () => {
  const runSpy = jest.spyOn(tenantDb, 'run');
  await service.checkout(dto, customerId);
  expect(runSpy).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/api test -- checkout.service`
Expected: FAIL due to multiple calls or signature mismatches.

- [ ] **Step 3: Update `DatabaseModule` pool configuration**

In `apps/api/src/db/database.module.ts`:
Add `extra: { max: 20, connectionTimeoutMillis: 5_000 }` to TypeORM connection configuration options.

- [ ] **Step 4: Update `TenantSettingsService.getSettings` to accept optional `manager`**

In `apps/api/src/tenant-settings/tenant-settings.service.ts`:
```ts
async getSettings(manager?: EntityManager): Promise<TenantSettings> {
  const work = async (em: EntityManager) => {
    let settings = await em.findOne(TenantSettings, { where: {} });
    if (!settings) {
      const tId = this.cls.get<string>('tenantId');
      settings = em.create(TenantSettings, {
        tenantId: tId,
        allowGuestCheckout: true,
        platformFeePercent: 2.5,
      });
      settings = await em.save(settings);
    }
    return settings;
  };

  return manager ? work(manager) : this.tenantDb.run(work);
}
```

- [ ] **Step 5: Refactor `CheckoutService.checkout` to read settings once upfront**

In `apps/api/src/checkout/checkout.service.ts`:
Read settings before `this.tenantDb.run`:
```ts
async checkout(
  dto: CheckoutDto,
  customerId?: string,
): Promise<{ order: Order; guestAccessToken: string | null }> {
  const settings = await this.tenantSettingsService.getSettings();

  if (!customerId && !settings.allowGuestCheckout) {
    throw new CodedForbiddenException(
      ErrorCode.GUEST_CHECKOUT_DISABLED,
      'Guest checkout is disabled for this store',
    );
  }

  return this.tenantDb.run(async (manager) => {
    // ... use settings.platformFeePercent directly without calling getSettings again
```

- [ ] **Step 6: Run unit test to verify it passes**

Run: `pnpm --filter @tiny-threads/api test -- checkout.service`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/db/database.module.ts apps/api/src/tenant-settings/tenant-settings.service.ts apps/api/src/checkout/checkout.service.ts apps/api/src/checkout/__tests__/checkout.service.spec.ts
git commit -m "fix(checkout): unnest tenant settings transaction and configure connection pool limits"
```

---

### Task 2: Eliminate Checkout Cart IDOR by Deriving Cart Identity (R4)

**Files:**
- Modify: `apps/api/src/carts/carts.service.ts`
- Modify: `apps/api/src/checkout/dto/checkout.dto.ts`
- Modify: `apps/api/src/checkout/checkout.controller.ts`
- Modify: `apps/api/src/checkout/checkout.service.ts`
- Test: `apps/api/src/checkout/__tests__/checkout.service.spec.ts`

**Interfaces:**
- Consumes: Exported `activeCartWhere(customerId?: string, sessionId?: string)` from `CartsService`
- Produces: Checkout route secured against cart IDOR by deriving cart identity from request credentials.

- [ ] **Step 1: Export `activeCartWhere` from `CartsService`**

In `apps/api/src/carts/carts.service.ts`:
```ts
export function activeCartWhere(
  customerId?: string,
  sessionId?: string,
): FindOptionsWhere<Cart> {
  return customerId
    ? { customerId, status: 'active' }
    : { sessionId, customerId: IsNull(), status: 'active' };
}
```

- [ ] **Step 2: Remove `cartId` from `CheckoutDto`**

In `apps/api/src/checkout/dto/checkout.dto.ts`:
Remove `cartId` property and `@IsUUID()` decorator.

- [ ] **Step 3: Update `CheckoutController` to accept `x-guest-session-id` header**

In `apps/api/src/checkout/checkout.controller.ts`:
```ts
@Post()
@UseGuards(OptionalCustomerJwtAuthGuard)
async checkout(
  @Req() req: Request,
  @Headers('x-guest-session-id') guestSessionId: string | undefined,
  @Body() dto: CheckoutDto,
) {
  const customerId = (req.user as CustomerAccessTokenPayload | undefined)?.sub;
  return this.checkoutService.checkout(dto, customerId, guestSessionId);
}
```

- [ ] **Step 4: Update `CheckoutService.checkout` to resolve cart via `activeCartWhere`**

In `apps/api/src/checkout/checkout.service.ts`:
```ts
async checkout(
  dto: CheckoutDto,
  customerId?: string,
  sessionId?: string,
): Promise<{ order: Order; guestAccessToken: string | null }> {
  // ...
  return this.tenantDb.run(async (manager) => {
    const cart = await manager.findOne(Cart, {
      where: activeCartWhere(customerId, sessionId),
      relations: { items: true },
    });

    if (!cart || !cart.items || cart.items.length === 0) {
      throw new CodedBadRequestException(
        ErrorCode.CART_EMPTY,
        'Cart is empty',
      );
    }
```

- [ ] **Step 5: Write unit tests verifying IDOR protection**

In `apps/api/src/checkout/__tests__/checkout.service.spec.ts`:
Add test asserting that a customer or guest cannot check out a cart belonging to a different user/session.

- [ ] **Step 6: Run tests to verify pass**

Run: `pnpm --filter @tiny-threads/api test -- checkout`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/carts/carts.service.ts apps/api/src/checkout/
git commit -m "fix(checkout): derive cart identity to eliminate checkout cart IDOR vulnerability"
```

---

### Task 3: Merchant Platform Fee Write Protection & Bounds Defense (R5)

**Files:**
- Modify: `apps/api/src/tenant-settings/dto/update-tenant-settings.dto.ts`
- Modify: `apps/api/src/payments/payments.service.ts`
- Test: `apps/api/src/payments/__tests__/payments.service.spec.ts`

**Interfaces:**
- Consumes: `PaymentsService.processOrderPayment(order, paymentToken, platformFeePercent, manager)`
- Produces: Writable surface cleanup and fee percentage runtime validation (`0 <= fee <= 100`).

- [ ] **Step 1: Write failing unit test for platform fee percentage bounds**

In `apps/api/src/payments/__tests__/payments.service.spec.ts`:
```ts
it('should throw CodedBadRequestException if platformFeePercent is negative or > 100', async () => {
  await expect(
    service.processOrderPayment(mockOrder, 'token', -5),
  ).rejects.toThrow(CodedBadRequestException);

  await expect(
    service.processOrderPayment(mockOrder, 'token', 150),
  ).rejects.toThrow(CodedBadRequestException);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/api test -- payments.service`
Expected: FAIL.

- [ ] **Step 3: Remove `platformFeePercent` from `UpdateTenantSettingsDto`**

In `apps/api/src/tenant-settings/dto/update-tenant-settings.dto.ts`:
Remove `platformFeePercent` property and `@IsNumber()` decorator so merchant admins cannot write it.

- [ ] **Step 4: Add fee bounds defense in `PaymentsService.processOrderPayment`**

In `apps/api/src/payments/payments.service.ts`:
```ts
const pct = Number(platformFeePercent);
if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
  throw new CodedBadRequestException(
    ErrorCode.VALIDATION_FAILED,
    'Platform fee percentage is out of range',
  );
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `pnpm --filter @tiny-threads/api test -- payments.service`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/tenant-settings/dto/update-tenant-settings.dto.ts apps/api/src/payments/
git commit -m "fix(tenant-settings, payments): remove platform fee writability and enforce fee percentage bounds"
```

---

### Task 4: Enforce Positive Integer Refunds (R6)

**Files:**
- Modify: `apps/api/src/orders/dto/refund-order.dto.ts`
- Modify: `apps/api/src/payments/payments.service.ts`
- Test: `apps/api/src/payments/__tests__/payments.service.spec.ts`

**Interfaces:**
- Consumes: `PaymentsService.refundPayment(orderId, amountCents, reason, manager)`
- Produces: Validation pipeline rejecting negative or non-integer refund amounts.

- [ ] **Step 1: Write failing unit test for invalid refund amounts**

In `apps/api/src/payments/__tests__/payments.service.spec.ts`:
```ts
it('should reject negative, zero, or non-integer refund amounts', async () => {
  await expect(service.refundPayment('order-1', -100)).rejects.toThrow(CodedBadRequestException);
  await expect(service.refundPayment('order-1', 0)).rejects.toThrow(CodedBadRequestException);
  await expect(service.refundPayment('order-1', 12.50)).rejects.toThrow(CodedBadRequestException);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/api test -- payments.service`
Expected: FAIL.

- [ ] **Step 3: Update `RefundOrderDto` validation decorators**

In `apps/api/src/orders/dto/refund-order.dto.ts`:
```ts
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class RefundOrderDto {
  @ApiProperty({ description: 'Amount in minor units (cents) to refund', example: 2500 })
  @IsInt({ message: field(ErrorCode.IS_INT) })
  @Min(1, { message: field(ErrorCode.MIN) })
  amountCents!: number;
```

- [ ] **Step 4: Add service-level guard in `PaymentsService.refundPayment`**

In `apps/api/src/payments/payments.service.ts`:
```ts
if (!Number.isInteger(amountCents) || amountCents <= 0) {
  throw new CodedBadRequestException(
    ErrorCode.VALIDATION_FAILED,
    'Refund amount must be a positive integer number of minor units',
  );
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `pnpm --filter @tiny-threads/api test -- payments.service`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/orders/dto/refund-order.dto.ts apps/api/src/payments/
git commit -m "fix(orders, payments): enforce positive integer validation for refund amountCents"
```

---

### Task 5: Automatic Refund on Order Cancellation & Concurrency Locking for Stock Restoration (R7 & R8)

**Files:**
- Modify: `apps/api/src/orders/orders.service.ts`
- Test: `apps/api/src/orders/__tests__/orders.service.spec.ts`

**Interfaces:**
- Consumes: `OrdersService.transitionStatus` and `OrdersService.restoreStockForOrder`
- Produces: Refund execution on paid order cancellation; pessimistic locking & sorted variant updates during stock restoration.

- [ ] **Step 1: Write failing unit test for paid order cancellation refund & stock restoration locking**

In `apps/api/src/orders/__tests__/orders.service.spec.ts`:
```ts
it('should automatically refund captured payment when cancelling a paid order', async () => {
  const refundSpy = jest.spyOn(paymentsService, 'refundPayment');
  const result = await service.transitionStatus('order-paid-1', 'cancelled', 'admin');
  expect(refundSpy).toHaveBeenCalledWith('order-paid-1', mockOrder.totalCents, 'Order cancelled', expect.anything());
  expect(result.paymentStatus).toBe('refunded');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/api test -- orders.service`
Expected: FAIL.

- [ ] **Step 3: Implement automatic refund on paid order cancellation (R7)**

In `apps/api/src/orders/orders.service.ts` (`transitionStatus`):
```ts
if (newStatus === 'cancelled') {
  await this.restoreStockForOrder(manager, order);

  if (order.paymentStatus === 'captured') {
    await this.paymentsService.refundPayment(
      order.id,
      order.totalCents,
      'Order cancelled',
      manager,
    );
    order.paymentStatus = 'refunded';
  }
}
```

- [ ] **Step 4: Implement pessimistic locking and sorted variant restoration (R8)**

In `apps/api/src/orders/orders.service.ts` (`restoreStockForOrder`):
```ts
private async restoreStockForOrder(
  manager: EntityManager,
  order: Order,
): Promise<void> {
  if (!order.items || order.items.length === 0) return;

  const items = [...order.items]
    .filter((i) => i.variantId)
    .sort((a, b) => a.variantId.localeCompare(b.variantId));

  for (const item of items) {
    const variant = await manager.findOne(ProductVariant, {
      where: { id: item.variantId },
      lock: { mode: 'pessimistic_write' },
    });
    if (variant) {
      variant.stock += item.quantity;
      await manager.save(ProductVariant, variant);
    }
  }
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `pnpm --filter @tiny-threads/api test -- orders.service`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/orders/orders.service.ts apps/api/src/orders/__tests__/orders.service.spec.ts
git commit -m "fix(orders): execute payment refund on paid order cancel and apply pessimistic variant locks"
```

---

### Task 6: Constant-Time Guest Order Access Token Verification (R10)

**Files:**
- Modify: `apps/api/src/orders/orders.service.ts`
- Test: `apps/api/src/orders/__tests__/orders.service.spec.ts`

**Interfaces:**
- Consumes: `OrdersService.getGuestOrder(orderId, token)`
- Produces: Constant-time comparison of guest access token SHA-256 digests.

- [ ] **Step 1: Write unit test verifying guest token lookup with valid and invalid tokens**

In `apps/api/src/orders/__tests__/orders.service.spec.ts`:
```ts
it('should correctly verify guest order token using timing-safe comparison', async () => {
  const valid = await service.getGuestOrder('order-guest-1', 'raw_valid_token');
  expect(valid.id).toBe('order-guest-1');

  await expect(service.getGuestOrder('order-guest-1', 'invalid_token')).rejects.toThrow(CodedNotFoundException);
});
```

- [ ] **Step 2: Implement `timingSafeEqual` in `getGuestOrder`**

In `apps/api/src/orders/orders.service.ts`:
```ts
import { timingSafeEqual } from 'node:crypto';

// In getGuestOrder:
const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
const supplied = Buffer.from(tokenHash, 'hex');
const stored = order?.guestAccessTokenHash
  ? Buffer.from(order.guestAccessTokenHash, 'hex')
  : null;

if (
  !order ||
  !stored ||
  stored.length !== supplied.length ||
  !timingSafeEqual(stored, supplied)
) {
  throw new CodedNotFoundException(
    ErrorCode.ORDER_NOT_FOUND,
    'Order not found',
  );
}
```

- [ ] **Step 3: Run full test suite to verify all unit tests pass**

Run: `pnpm --filter @tiny-threads/api test`
Expected: PASS for all suites.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/orders/orders.service.ts apps/api/src/orders/__tests__/orders.service.spec.ts
git commit -m "fix(orders): use timingSafeEqual for guest order access token comparison"
```
