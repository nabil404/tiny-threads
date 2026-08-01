# Spec: Order & Checkout Engine

**Date:** 2026-08-01  
**Status:** Approved  
**Scope:** Multi-tenant Storefront Checkout, Inventory Reservation, Order State Machine, Payment Engine, Settlements, and Refunds.

---

## 1. Overview & Architecture

The **Order & Checkout Engine** provides end-to-end commerce ordering capabilities for Tiny Threads across storefront customers, guest shoppers, merchant administrators, and payment providers.

Following the platform's multi-tenant architecture and domain-driven design, the engine is split into three decoupled bounded context modules in `apps/api/src/`:
- **`checkout`**: Handles cart-to-order preparation, guest-checkout validation against tenant settings, stock checks with row locking (`FOR UPDATE`), atomic stock reservation, address capturing, price snapshotting, and initial order creation.
- **`orders`**: Manages order entities, state machine transitions (`pending_payment`, `paid`, `processing`, `shipped`, `delivered`, `cancelled`, `refunded`), order item snapshots, customer order history, guest access token validation, and merchant admin fulfillment actions.
- **`payments`**: Implements vendor-agnostic payment abstractions using the Ports & Adapters pattern (`PaymentProvider` interface port), provides `MockPaymentProvider` (simulating instant approval, instant decline, and deferred webhooks), calculates marketplace settlements split, and handles full/partial refunds.

---

## 2. Database Entities & Schema Definitions

All entities are tenant-scoped with primary keys `(tenant_id, id)` and PostgreSQL Row-Level Security (RLS) policies enabled (`ENABLE` + `FORCE`), inheriting from `TenantEntityBase` or `ImmutableTenantEntityBase`.

### 2.1 `TenantSettings` (`tenant_settings` table)
- **`tenant_id`**: `uuid` (PK, FK to `tenants.id`)
- **`allow_guest_checkout`**: `boolean` (default `true`)
- **`platform_fee_percent`**: `numeric(5,2)` (default `2.50`)
- **`created_at`**, **`updated_at`**

### 2.2 `Order` (`orders` table)
- **`tenant_id`**: `uuid` (PK, FK)
- **`id`**: `uuid` (PK, `uuidv7`)
- **`customer_id`**: `uuid` (FK, nullable for unlinked guest checkout)
- **`customer_email`**: `string`
- **`status`**: `varchar` (`pending_payment`, `paid`, `processing`, `shipped`, `delivered`, `cancelled`, `refunded`)
- **`payment_status`**: `varchar` (`pending`, `authorized`, `captured`, `failed`, `refunded`, `partially_refunded`)
- **`currency_code`**: `varchar` (FK to `currencies.code`)
- **`total_cents`**: `integer`
- **`shipping_address`**: `jsonb` (`line1`, `line2`, `city`, `state`, `postal_code`, `country_code`)
- **`billing_address`**: `jsonb`
- **`guest_access_token_hash`**: `varchar` (nullable, hashed lookup for unauthenticated guest order tracking)
- **`expires_at`**: `timestamptz` (nullable, stock reservation timeout for `pending_payment` orders)
- **`created_at`**, **`updated_at`**

### 2.3 `OrderItem` (`order_items` table)
- **`tenant_id`**: `uuid` (PK, FK)
- **`id`**: `uuid` (PK, `uuidv7`)
- **`order_id`**: `uuid` (FK to `orders.id` on `(tenant_id, order_id)`)
- **`variant_id`**: `uuid` (FK to `product_variants.id` on `(tenant_id, variant_id)`)
- **`name_snapshot`**: `string` (product title + variant option titles captured at purchase)
- **`price_cents_snapshot`**: `integer` (unit price in cents captured at purchase)
- **`qty`**: `integer`
- **`created_at`**, **`updated_at`**

### 2.4 `OrderEvent` (`order_events` table)
- **`tenant_id`**: `uuid` (PK, FK)
- **`id`**: `uuid` (PK, `uuidv7`)
- **`order_id`**: `uuid` (FK to `orders.id` on `(tenant_id, order_id)`)
- **`type`**: `string` (`order_created`, `payment_authorized`, `payment_captured`, `order_shipped`, `order_cancelled`, `order_refunded`)
- **`provider_event_id`**: `string` (nullable, used for webhook deduplication)
- **`payload`**: `jsonb`
- **`created_at`** (Immutable entity)

### 2.5 `Payment` (`payments` table)
- **`tenant_id`**: `uuid` (PK, FK)
- **`id`**: `uuid` (PK, `uuidv7`)
- **`order_id`**: `uuid` (FK to `orders.id`)
- **`provider_config_id`**: `uuid` (FK to `payment_provider_configs.id`)
- **`amount_cents`**: `integer`
- **`status`**: `varchar` (`pending`, `authorized`, `captured`, `failed`, `refunded`, `partially_refunded`)
- **`created_at`**, **`updated_at`**

### 2.6 `Settlement` (`settlements` table)
- **`tenant_id`**: `uuid` (PK, FK)
- **`id`**: `uuid` (PK, `uuidv7`)
- **`payment_id`**: `uuid` (FK to `payments.id`)
- **`merchant_cents`**: `integer`
- **`platform_fee_cents`**: `integer`
- **`status`**: `varchar` (`pending`, `settled`)
- **`created_at`**, **`updated_at`**

### 2.7 `Refund` (`refunds` table)
- **`tenant_id`**: `uuid` (PK, FK)
- **`id`**: `uuid` (PK, `uuidv7`)
- **`payment_id`**: `uuid` (FK to `payments.id`)
- **`settlement_id`**: `uuid` (FK to `settlements.id`)
- **`amount_cents`**: `integer`
- **`reason`**: `string`
- **`created_at`** (Immutable entity)

---

## 3. Checkout & Inventory Reservation Flow

1. **Guard & Validation**:
   - `POST /api/v1/checkout` checks authentication state.
   - If user is unauthenticated, queries `tenant_settings.allow_guest_checkout`. If `false`, throws `CodedForbiddenException('GUEST_CHECKOUT_DISABLED')`.
   - If guest checkout is allowed, links/creates customer by email in `customers`.
2. **Transaction & Row Locking**:
   - Executed inside `TenantDbService.run(...)` transaction.
   - Validates active cart (`carts.status = 'active'`) and cart items. Throws `CART_EMPTY` if zero items.
   - Queries `product_variants` with `SELECT ... FOR UPDATE` row locks for all variants in cart.
   - Verifies `variant.stock >= item.qty` for all lines. If any line is out of stock, aborts transaction and throws `CodedBadRequestException('INSUFFICIENT_STOCK')`.
   - Decrements stock: `variant.stock -= item.qty`.
3. **Snapshotting & Creation**:
   - Creates `orders` with `status: 'pending_payment'`, `payment_status: 'pending'`, `expires_at: NOW() + 15 minutes`.
   - Creates `order_items` with title snapshot and price snapshot.
   - Generates and hashes `guest_access_token` for guest tracking.
   - Sets `carts.status = 'converted'`.
   - Emits `order_events` (`type: 'order_created'`).

---

## 4. Order State Machine & Role Capabilities

### 4.1 State Machine
- `status`: `pending_payment` ➔ `paid` ➔ `processing` ➔ `shipped` ➔ `delivered` (Terminal: `cancelled`, `refunded`).
- `payment_status`: `pending` ➔ `authorized` ➔ `captured` (Terminal/Sub-states: `failed`, `partially_refunded`, `refunded`).

### 4.2 Customer Access
- `GET /api/v1/customers/orders`: List authenticated customer orders.
- `GET /api/v1/customers/orders/:id`: Detail view (ownership verified).
- `POST /api/v1/customers/orders/:id/cancel`: Customer self-cancel.
  - Allowed **only** when `order.status == 'pending_payment'`. Restores variant stock (`variant.stock += item.qty`).
  - If order is `paid` or beyond, throws `CodedBadRequestException('ORDER_CANNOT_BE_CANCELLED')`.
- `GET /api/v1/guest/orders/:id?token=<guest_token>`: Unauthenticated guest order status lookup.

### 4.3 Merchant Admin Access (`@Roles(Role.OWNER, Role.ADMIN, Role.STAFF)`)
- `GET /api/v1/merchant-admins/orders`: List/filter all tenant orders (paginated).
- `GET /api/v1/merchant-admins/orders/:id`: Full order inspection with events and settlement split.
- `PATCH /api/v1/merchant-admins/orders/:id/status`: Transition order fulfillment state.
- `POST /api/v1/merchant-admins/orders/:id/refund`: Execute full or partial refund.
- `GET /api/v1/merchant-admins/settings` & `PATCH /api/v1/merchant-admins/settings`: Manage tenant settings (`allow_guest_checkout`).

---

## 5. Payment Engine Architecture

1. **`PaymentProvider` Interface Port**:
   Defines `processPayment`, `refundPayment`, and `handleWebhook`.
2. **`MockPaymentProvider`**:
   - Registered under `provider_code = 'mock'`.
   - `mock_success`: Synchronous capture, updates order `status = 'paid'`, creates `payments` & `settlements`.
   - `mock_decline`: Marks order `cancelled`, restores stock.
   - `mock_deferred`: Leaves `payment_status = 'pending'`. Triggered via `POST /api/v1/payments/webhooks/mock`.
3. **Settlement Split**:
   - `platform_fee_cents = Math.round(amount_cents * platform_fee_percent)`
   - `merchant_cents = amount_cents - platform_fee_cents`
   - Row saved to `settlements` with `status: 'settled'`.
4. **Refund Processing**:
   - Inserts `refunds` row, adjusts settlement balance, updates `payment_status` to `'partially_refunded'` or `'refunded'`.

---

## 6. Shared Error Codes (`packages/shared`)

Added to `ErrorCode` enum:
- `GUEST_CHECKOUT_DISABLED`
- `CART_EMPTY`
- `INSUFFICIENT_STOCK`
- `ORDER_NOT_FOUND`
- `ORDER_EXPIRED`
- `ORDER_CANNOT_BE_CANCELLED`
- `INVALID_ORDER_STATUS_TRANSITION`
- `PAYMENT_FAILED`
- `REFUND_EXCEEDS_PAYMENT`

---

## 7. Testing Strategy

1. **Unit Testing**:
   - `CheckoutService`: Stock checks, guest rules, price snapshots, stock decrements.
   - `OrdersService`: State machine transitions, customer self-cancel restrictions.
   - `PaymentsService` & `MockPaymentProvider`: Success, decline, deferred webhooks, settlement split formulas, refund handling.
2. **Integration / E2E Testing**:
   - Multi-tenant RLS isolation on `orders`, `payments`, `settlements`, `tenant_settings`.
   - Concurrent checkout requests validating row locks on `product_variants.stock`.
   - Guest order tracking token validation.
