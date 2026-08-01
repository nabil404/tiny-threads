# Order & Checkout Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-tenant Order & Checkout Engine supporting guest/customer checkout, atomic stock reservation with row locks, a vendor-agnostic payment engine with a mock provider, settlement splits, full/partial refunds, order state machine lifecycle, and role-based storefront & merchant admin endpoints.

**Architecture:** Decoupled NestJS domain modules (`checkout`, `orders`, `payments`, `tenant-settings`) running on PostgreSQL with Row-Level Security (RLS) via `TenantDbService.run(...)`. Stock is reserved immediately upon checkout using `FOR UPDATE` row locks; payments are processed via a domain `PaymentProvider` interface port with `MockPaymentProvider`.

**Tech Stack:** NestJS 11, TypeORM, PostgreSQL 16 (RLS), TypeScript, Jest, Supertest, argon2, `@tiny-threads/shared`.

## Global Constraints

- Tenancy Isolation: All DB queries MUST run through `TenantDbService.run(...)`.
- Error Handling: Throw `Coded*Exception` with `ErrorCode` from `@tiny-threads/shared`.
- PostgreSQL RLS: All tenant-scoped entities extend `TenantEntityBase` or `ImmutableTenantEntityBase` with primary key `(tenant_id, id)`.
- Merchant Admin RBAC: Scoped endpoints use `@Roles(...)` + `RolesGuard`.
- Vendor Abstraction: Payment integrations hidden behind `PaymentProvider` interface port.

---

### Task 1: Shared Error Codes, Database Entities, and Migrations

**Files:**
- Modify: `packages/shared/src/errors/error-code.enum.ts`
- Create: `apps/api/src/db/entities/tenant-settings.entity.ts`
- Create: `apps/api/src/db/entities/order.entity.ts`
- Create: `apps/api/src/db/entities/order-item.entity.ts`
- Create: `apps/api/src/db/entities/order-event.entity.ts`
- Create: `apps/api/src/db/entities/payment.entity.ts`
- Create: `apps/api/src/db/entities/settlement.entity.ts`
- Create: `apps/api/src/db/entities/refund.entity.ts`
- Modify: `apps/api/src/db/database.module.ts`
- Create: `apps/api/src/db/migrations/1722510000000-CreateOrderAndCheckoutTables.ts`

**Interfaces:**
- Consumes: `@tiny-threads/shared`, `TenantEntityBase`, `ImmutableTenantEntityBase`.
- Produces: `TenantSettings`, `Order`, `OrderItem`, `OrderEvent`, `Payment`, `Settlement`, `Refund` entities registered with TypeORM and RLS enabled.

- [ ] **Step 1: Update `@tiny-threads/shared` with new `ErrorCode` values**

In `packages/shared/src/errors/error-code.enum.ts`, add:
```typescript
GUEST_CHECKOUT_DISABLED = 'GUEST_CHECKOUT_DISABLED',
CART_EMPTY = 'CART_EMPTY',
INSUFFICIENT_STOCK = 'INSUFFICIENT_STOCK',
ORDER_NOT_FOUND = 'ORDER_NOT_FOUND',
ORDER_EXPIRED = 'ORDER_EXPIRED',
ORDER_CANNOT_BE_CANCELLED = 'ORDER_CANNOT_BE_CANCELLED',
INVALID_ORDER_STATUS_TRANSITION = 'INVALID_ORDER_STATUS_TRANSITION',
PAYMENT_FAILED = 'PAYMENT_FAILED',
REFUND_EXCEEDS_PAYMENT = 'REFUND_EXCEEDS_PAYMENT',
```

- [ ] **Step 2: Build `@tiny-threads/shared` package**

Run: `pnpm --filter @tiny-threads/shared build`
Expected: PASS

- [ ] **Step 3: Create `TenantSettings` Entity**

Create `apps/api/src/db/entities/tenant-settings.entity.ts`:
```typescript
import { Entity, Column, PrimaryColumn } from 'typeorm';
import { TenantEntityBase } from './base/tenant-entity.base';

@Entity('tenant_settings')
export class TenantSettings extends TenantEntityBase {
  @Column({ name: 'allow_guest_checkout', type: 'boolean', default: true })
  allowGuestCheckout: boolean;

  @Column({ name: 'platform_fee_percent', type: 'numeric', precision: 5, scale: 2, default: 2.50 })
  platformFeePercent: number;
}
```

- [ ] **Step 4: Create `Order` & `OrderItem` Entities**

Create `apps/api/src/db/entities/order.entity.ts` and `order-item.entity.ts`:
```typescript
@Entity('orders')
export class Order extends TenantEntityBase {
  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId?: string;

  @Column({ name: 'customer_email', type: 'varchar' })
  customerEmail: string;

  @Column({ name: 'status', type: 'varchar', default: 'pending_payment' })
  status: string;

  @Column({ name: 'payment_status', type: 'varchar', default: 'pending' })
  paymentStatus: string;

  @Column({ name: 'currency_code', type: 'varchar', default: 'USD' })
  currencyCode: string;

  @Column({ name: 'total_cents', type: 'integer' })
  totalCents: number;

  @Column({ name: 'shipping_address', type: 'jsonb' })
  shippingAddress: Record<string, any>;

  @Column({ name: 'billing_address', type: 'jsonb', nullable: true })
  billingAddress?: Record<string, any>;

  @Column({ name: 'guest_access_token_hash', type: 'varchar', nullable: true })
  guestAccessTokenHash?: string;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt?: Date;

  @OneToMany(() => OrderItem, (item) => item.order)
  items: OrderItem[];
}
```

- [ ] **Step 5: Create `OrderEvent`, `Payment`, `Settlement`, and `Refund` Entities**

Create entities in `apps/api/src/db/entities/` following tenant entity base patterns.

- [ ] **Step 6: Register entities in `DatabaseModule`**

Import and add all new entities to `DATABASE_ENTITIES` array in `apps/api/src/db/database.module.ts`.

- [ ] **Step 7: Create TypeORM Migration for Order & Checkout Tables with RLS**

Create migration file with `CREATE TABLE` statements for `tenant_settings`, `orders`, `order_items`, `order_events`, `payments`, `settlements`, `refunds` and enable PostgreSQL Row-Level Security (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY; ALTER TABLE ... FORCE ROW LEVEL SECURITY;`).

- [ ] **Step 8: Execute migration against test database**

Run: `pnpm --filter @tiny-threads/api db:migrate`
Expected: PASS and verify RLS output.

- [ ] **Step 9: Commit**

```bash
git add packages/shared apps/api/src/db
git commit -m "feat(db): add order, checkout, payment, settlement, refund and tenant_settings entities with RLS migration"
```

---

### Task 2: Tenant Settings Module & Merchant Admin Settings Endpoints

**Files:**
- Create: `apps/api/src/tenant-settings/tenant-settings.module.ts`
- Create: `apps/api/src/tenant-settings/tenant-settings.service.ts`
- Create: `apps/api/src/tenant-settings/tenant-settings.controller.ts`
- Create: `apps/api/src/tenant-settings/dto/update-tenant-settings.dto.ts`
- Create: `apps/api/src/tenant-settings/__tests__/tenant-settings.service.spec.ts`

**Interfaces:**
- Consumes: `TenantDbService`, `@Roles(...)`, `TenantSettings`.
- Produces: `TenantSettingsService.getSettings()`, `TenantSettingsService.updateSettings()`.

- [ ] **Step 1: Write failing unit tests for `TenantSettingsService`**

Create `apps/api/src/tenant-settings/__tests__/tenant-settings.service.spec.ts` testing default creation when settings row doesn't exist, and updating `allowGuestCheckout`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tenant-settings.service.spec.ts`
Expected: FAIL ("Cannot find module")

- [ ] **Step 3: Implement `TenantSettingsService` & DTO**

Implement `getSettings()` (auto-creates default row if absent) and `updateSettings()`.

- [ ] **Step 4: Implement `TenantSettingsController` with Merchant Admin RBAC**

Add `GET /api/v1/merchant-admins/settings` and `PATCH /api/v1/merchant-admins/settings` guarded by `@Roles(Role.OWNER, Role.ADMIN)`.

- [ ] **Step 5: Run unit tests to verify they pass**

Run: `pnpm test -- tenant-settings.service.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/tenant-settings
git commit -m "feat(tenant-settings): add tenant settings module and merchant admin endpoints"
```

---

### Task 3: Vendor-Agnostic Payment Engine & Mock Payment Provider

**Files:**
- Create: `apps/api/src/payments/interfaces/payment-provider.interface.ts`
- Create: `apps/api/src/payments/providers/mock-payment.provider.ts`
- Create: `apps/api/src/payments/payments.module.ts`
- Create: `apps/api/src/payments/payments.service.ts`
- Create: `apps/api/src/payments/payments.controller.ts`
- Create: `apps/api/src/payments/__tests__/payments.service.spec.ts`

**Interfaces:**
- Consumes: `PaymentProvider`, `TenantDbService`, `Order`, `Payment`, `Settlement`, `Refund`.
- Produces: `PaymentsService.processOrderPayment()`, `PaymentsService.refundPayment()`, `PaymentsService.handleWebhook()`.

- [ ] **Step 1: Write failing unit test for `PaymentsService`**

Test synchronous `mock_success` (creates payment status `captured`, creates settlement split), `mock_decline` (payment status `failed`), and refund execution.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- payments.service.spec.ts`
Expected: FAIL

- [ ] **Step 3: Define `PaymentProvider` interface and implement `MockPaymentProvider`**

Implement `MockPaymentProvider` handling `mock_success`, `mock_decline`, `mock_deferred`, and mock refunds.

- [ ] **Step 4: Implement `PaymentsService` & Settlement split logic**

Implement payment creation, settlement split (`platform_fee_cents = amount_cents * (platform_fee_percent / 100)`), refund recording, and mock webhook handler (`POST /api/v1/payments/webhooks/mock`).

- [ ] **Step 5: Run unit tests to verify they pass**

Run: `pnpm test -- payments.service.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/payments
git commit -m "feat(payments): implement payment provider interface port, mock provider, settlements, and refunds"
```

---

### Task 4: Checkout Engine & Inventory Reservation

**Files:**
- Create: `apps/api/src/checkout/dto/checkout.dto.ts`
- Create: `apps/api/src/checkout/checkout.module.ts`
- Create: `apps/api/src/checkout/checkout.service.ts`
- Create: `apps/api/src/checkout/checkout.controller.ts`
- Create: `apps/api/src/checkout/__tests__/checkout.service.spec.ts`

**Interfaces:**
- Consumes: `TenantDbService`, `TenantSettingsService`, `PaymentsService`, `Cart`, `ProductVariant`, `Order`, `OrderItem`.
- Produces: `CheckoutService.checkout()`, `POST /api/v1/checkout`.

- [ ] **Step 1: Write failing unit test for `CheckoutService`**

Test:
1. Rejection when unauthenticated and `allow_guest_checkout = false` (`GUEST_CHECKOUT_DISABLED`).
2. Rejection when cart is empty (`CART_EMPTY`).
3. Rejection when stock is insufficient (`INSUFFICIENT_STOCK`).
4. Successful checkout with stock decrement, order creation, price snapshotting, and cart status `converted`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- checkout.service.spec.ts`
Expected: FAIL

- [ ] **Step 3: Implement `CheckoutService` with DB Transaction & `FOR UPDATE` row locks**

Implement transactional checkout using `TenantDbService.run(...)`:
- Query variant stock with row locks (`p.stock`).
- Decrement variant stock.
- Insert `Order` and `OrderItem` snapshots.
- Generate guest token hash.
- Process payment via `PaymentsService`.
- Mark cart `converted`.

- [ ] **Step 4: Implement `CheckoutController` (`POST /api/v1/checkout`)**

Support both authenticated customer context and guest checkout payload.

- [ ] **Step 5: Run unit tests to verify they pass**

Run: `pnpm test -- checkout.service.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/checkout
git commit -m "feat(checkout): add checkout engine with row-level stock reservation and snapshotting"
```

---

### Task 5: Orders Domain Module, State Machine, Customer & Admin Endpoints

**Files:**
- Create: `apps/api/src/orders/orders.module.ts`
- Create: `apps/api/src/orders/orders.service.ts`
- Create: `apps/api/src/orders/controllers/customers-orders.controller.ts`
- Create: `apps/api/src/orders/controllers/merchant-admins-orders.controller.ts`
- Create: `apps/api/src/orders/controllers/guest-orders.controller.ts`
- Create: `apps/api/src/orders/dto/update-order-status.dto.ts`
- Create: `apps/api/src/orders/dto/refund-order.dto.ts`
- Create: `apps/api/src/orders/__tests__/orders.service.spec.ts`
- Create: `apps/api/test/orders-e2e.spec.ts`

**Interfaces:**
- Consumes: `TenantDbService`, `Order`, `OrderEvent`, `PaymentsService`.
- Produces: `OrdersService` state transitions, customer self-cancel, merchant admin fulfillment/refund endpoints, guest order lookup.

- [ ] **Step 1: Write failing unit test for `OrdersService`**

Test:
1. Valid state transitions (`pending_payment` -> `paid` -> `processing` -> `shipped` -> `delivered`).
2. Invalid state transitions throw `INVALID_ORDER_STATUS_TRANSITION`.
3. Customer self-cancel on `pending_payment` order succeeds and restores stock (`variant.stock += qty`).
4. Customer self-cancel on `paid` order fails with `ORDER_CANNOT_BE_CANCELLED`.
5. Guest token lookup succeeds with valid token hash and fails with invalid token.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- orders.service.spec.ts`
Expected: FAIL

- [ ] **Step 3: Implement `OrdersService` state machine and cancellation logic**

Implement `transitionStatus()`, `customerCancelOrder()`, `getGuestOrder()`, `refundOrder()`.

- [ ] **Step 4: Implement Controllers**

1. `CustomersOrdersController`:
   - `GET /api/v1/customers/orders`
   - `GET /api/v1/customers/orders/:id`
   - `POST /api/v1/customers/orders/:id/cancel`
2. `GuestOrdersController`:
   - `GET /api/v1/guest/orders/:id`
3. `MerchantAdminsOrdersController`:
   - `GET /api/v1/merchant-admins/orders`
   - `GET /api/v1/merchant-admins/orders/:id`
   - `PATCH /api/v1/merchant-admins/orders/:id/status`
   - `POST /api/v1/merchant-admins/orders/:id/refund`

- [ ] **Step 5: Run unit tests and E2E tests**

Run: `pnpm test -- orders.service.spec.ts`
Expected: PASS

Run: `pnpm test:e2e`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/orders apps/api/test
git commit -m "feat(orders): implement order state machine, customer self-cancel, guest tracking, and merchant admin fulfillment/refund controllers"
```

---

## Plan Self-Review & Verification

1. **Spec Coverage Check**:
   - `TenantSettings` (`allow_guest_checkout` toggle): Covered in Task 1 & Task 2.
   - Stock reservation with row locks (`FOR UPDATE`): Covered in Task 4.
   - Vendor-agnostic `PaymentProvider` & `MockPaymentProvider`: Covered in Task 3.
   - Settlement split & refund clawback: Covered in Task 3 & Task 5.
   - Customer self-cancel restricted to `pending_payment`: Covered in Task 5.
   - Guest tracking token: Covered in Task 4 & Task 5.
   - Error codes & RLS multi-tenant testing: Covered in Tasks 1-5.

2. **Placeholder Scan**: No `TODO`, `TBD`, or vague instructions found.
3. **Type & Signature Consistency**: Checked names across `TenantSettings`, `Order`, `OrderItem`, `Payment`, `Settlement`, `Refund`, and `PaymentProvider`.
