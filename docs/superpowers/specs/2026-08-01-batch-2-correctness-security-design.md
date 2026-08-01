# Batch 2 — Correctness and Security Remediation Design

**Date:** 2026-08-01  
**Status:** Approved  
**Scope:** Remediation of issues R3 (checkout transaction deadlock), R4 (checkout cart IDOR), R5 (unbounded merchant platform fee write), R6 (negative/fractional refunds), R7 (cancelled paid order refund omission), R8 (stock restoration races), and R10 (guest order token timing attack) from `docs/plans/api-review-remediation-plan.md`.

---

## 1. Executive Summary

Batch 2 addresses 7 critical correctness and security vulnerabilities across the commerce engine (`checkout`, `carts`, `tenant-settings`, `payments`, and `orders`). These changes prevent pool deadlocks under concurrent checkout load, eliminate cross-customer cart hijacking (IDOR), protect platform revenue fee calculation, enforce positive integer money arithmetic for refunds, automatically refund captured funds on order cancellation, lock inventory variants deterministically during stock restoration, and implement constant-time secret comparison for guest orders.

---

## 2. Component Design & Changes

### 2.1 Checkout & Tenancy Isolation (R3 & R4)

#### R3: Prevent Connection Pool Deadlock
- **File**: `apps/api/src/checkout/checkout.service.ts`
  - Fetch tenant settings **once** before calling `this.tenantDb.run(...)`.
  - Pass `settings.platformFeePercent` directly to `paymentsService.processOrderPayment(savedOrder, paymentToken, settings.platformFeePercent, manager)`.
- **File**: `apps/api/src/tenant-settings/tenant-settings.service.ts`
  - Update `getSettings(manager?: EntityManager)` to accept an optional `manager?: EntityManager`.
  - If `manager` is provided, execute queries on `manager`; otherwise execute inside `this.tenantDb.run(...)`. Remove unused `tenantId` parameter.
- **File**: `apps/api/src/db/database.module.ts`
  - Configure pool options: `extra: { max: 20, connectionTimeoutMillis: 5_000 }`.

#### R4: Eliminate Checkout Cart IDOR
- **File**: `apps/api/src/carts/carts.service.ts`
  - Export `activeCartWhere(customerId?: string, sessionId?: string): FindOptionsWhere<Cart>`.
- **File**: `apps/api/src/checkout/dto/checkout.dto.ts`
  - Remove `cartId` field and `@IsUUID()` validation decorator.
- **File**: `apps/api/src/checkout/checkout.controller.ts`
  - Extract `@Headers('x-guest-session-id') guestSessionId: string | undefined`.
  - Validate guest session header format (UUID format check) if provided.
  - Pass `dto`, `customerId`, and `guestSessionId` to `checkoutService.checkout(...)`.
- **File**: `apps/api/src/checkout/checkout.service.ts`
  - Update method signature: `checkout(dto: CheckoutDto, customerId?: string, sessionId?: string)`.
  - Resolve cart using `manager.findOne(Cart, { where: activeCartWhere(customerId, sessionId), relations: { items: true } })`.
  - Throw `CodedBadRequestException(ErrorCode.CART_EMPTY, 'Cart is empty')` if no active cart or items found.

---

### 2.2 Financial Integrity & Input Validation (R5 & R6)

#### R5: Merchant Admin Platform Fee Protection
- **File**: `apps/api/src/tenant-settings/dto/update-tenant-settings.dto.ts`
  - Remove `platformFeePercent` field from `UpdateTenantSettingsDto`. Platform fee is a commercial platform-level setting, not a merchant store setting.
- **File**: `apps/api/src/payments/payments.service.ts`
  - In `processOrderPayment`: validate `platformFeePercent`:
    ```ts
    const pct = Number(platformFeePercent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      throw new CodedBadRequestException(
        ErrorCode.VALIDATION_FAILED,
        'Platform fee percentage is out of range',
      );
    }
    ```

#### R6: Positive Integer Refund Validation
- **File**: `apps/api/src/orders/dto/refund-order.dto.ts`
  - Replace `@IsNumber()` on `amountCents` with `@IsInt({ message: field(ErrorCode.IS_INT) })` and `@Min(1, { message: field(ErrorCode.MIN) })`.
- **File**: `apps/api/src/payments/payments.service.ts`
  - In `refundPayment`: add explicit guard:
    ```ts
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new CodedBadRequestException(
        ErrorCode.VALIDATION_FAILED,
        'Refund amount must be a positive integer number of minor units',
      );
    }
    ```

---

### 2.3 State Machine, Concurrency & Cryptography (R7, R8, R10)

#### R7: Automatic Refund on Order Cancellation
- **File**: `apps/api/src/orders/orders.service.ts`
  - In `transitionStatus`: when `newStatus === 'cancelled'`, if `order.paymentStatus === 'captured'`, call `await this.paymentsService.refundPayment(order.id, order.totalCents, 'Order cancelled', manager)` and update `order.paymentStatus = 'refunded'`. Add a `TODO` referencing R13 for authorization voiding once provider capabilities expand.

#### R8: Pessimistic Locking & Sorted Stock Restoration
- **File**: `apps/api/src/orders/orders.service.ts`
  - Update `restoreStockForOrder(manager: EntityManager, order: Order)` signature to remove `any`.
  - Sort `order.items` by `variantId` prior to locking/updating to enforce deterministic lock ordering.
  - Acquire `{ mode: 'pessimistic_write' }` lock when querying `ProductVariant` rows before incrementing `variant.stock`.

#### R10: Constant-Time Guest Token Hash Comparison
- **File**: `apps/api/src/orders/orders.service.ts`
  - In `getGuestOrder`: compare token hashes using `crypto.timingSafeEqual` with length pre-checking:
    ```ts
    import { timingSafeEqual } from 'node:crypto';

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const supplied = Buffer.from(tokenHash, 'hex');
    const stored = order?.guestAccessTokenHash
      ? Buffer.from(order.guestAccessTokenHash, 'hex')
      : null;

    if (!order || !stored || stored.length !== supplied.length || !timingSafeEqual(stored, supplied)) {
      throw new CodedNotFoundException(ErrorCode.ORDER_NOT_FOUND, 'Order not found');
    }
    ```

---

## 3. Verification Criteria

1. **Unit Tests**:
   - `CheckoutService`: single `tenantDb.run` invocation per checkout call; cart resolved via `activeCartWhere`.
   - `PaymentsService`: rejects invalid `platformFeePercent` and non-positive/fractional `amountCents`.
   - `OrdersService`: refunds captured payment on cancel transition; pessimistic lock acquired on stock restoration; constant-time token comparison passes.
2. **E2E / Integration**:
   - Customer checkout resolves cart without client `cartId`.
   - Rejects guest checkout when disabled.
   - All unit test suites pass (`pnpm --filter @tiny-threads/api test`).
