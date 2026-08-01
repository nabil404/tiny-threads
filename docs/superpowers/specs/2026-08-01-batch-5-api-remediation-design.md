# Design Spec: Batch 5 API Remediation — Architectural Drift (R11, R12, R13)

Date: 2026-08-01  
Status: Approved  
Scope: Redesign of Orders state machine, Shipments entity, Webhook idempotency/tenant resolution, and PaymentPort ADR D7 alignment.

---

## 1. Context & Objectives

Batch 5 of the API Review Remediation Plan addresses fundamental architectural drift across `apps/api`:
- **R11**: The Order state machine was implemented as a single flat enum (`pending_payment → paid → processing → shipped → delivered`). Per ADR D6 (`docs/architecture/references/d6-order-state-machines.md`), orders must be split into three coordinated sub-machines: `status` (lifecycle), `payment_status`, and `fulfillment_status` (derived from a `shipments` sub-entity), with store-level `capture_mode` support (`immediate` vs `authorize_then_capture`).
- **R12**: Webhooks lacked idempotency keys (`provider_event_id` column + `UNIQUE (tenant_id, provider_event_id)` constraint) and tenant resolution mechanism for incoming gateway calls.
- **R13**: `PaymentProvider` diverged from ADR D7 (`docs/architecture/references/d7-payment-port.md`). It lacked a `Money` value object, `idempotencyKey` parameters, `authorize`/`capture`/`void`/`refund` split, `parseEvent` signature/normalization, and per-tenant adapter resolution (`PaymentPortRegistry`).

---

## 2. Architecture & Pure Domain Layer

We enforce a strict separation between pure, DB-agnostic domain logic and TypeORM/NestJS infrastructure.

### 2.1 Pure Domain Layer (`apps/api/src/payments/domain/` & `apps/api/src/orders/domain/`)

#### `Money` Value Object (`payments/domain/money.ts`)
```ts
export interface Money {
  amount: number;   // Integer minor units (e.g. 1000 = $10.00)
  currency: string; // ISO-4217 3-letter code (e.g. 'USD')
}

export class MoneyUtil {
  static create(amount: number, currency: string): Money {
    if (!Number.isInteger(amount) || amount < 0) {
      throw new Error('Money amount must be a non-negative integer');
    }
    return { amount, currency: currency.toUpperCase() };
  }
  static add(a: Money, b: Money): Money {
    if (a.currency !== b.currency) throw new Error('Currency mismatch');
    return { amount: a.amount + b.amount, currency: a.currency };
  }
  static subtract(a: Money, b: Money): Money {
    if (a.currency !== b.currency) throw new Error('Currency mismatch');
    if (a.amount < b.amount) throw new Error('Insufficient funds for subtraction');
    return { amount: a.amount - b.amount, currency: a.currency };
  }
}
```

#### Three Coordinated Sub-Machines (`orders/domain/order-state-machine.ts`)
1. **`OrderLifecycleStatus`**: `'pending' | 'confirmed' | 'completed' | 'cancelled'`
   - `pending` → `confirmed` (payment authorized/paid)
   - `pending` → `cancelled` (checkout expired/abandoned)
   - `confirmed` → `completed` (fulfillment complete + payment finalized)
   - `confirmed` → `cancelled` (cancellation before completion; releases stock + voids/refunds payment)

2. **`OrderPaymentStatus`**: `'pending' | 'authorized' | 'partially_captured' | 'paid' | 'partially_refunded' | 'refunded' | 'voided' | 'failed' | 'disputed' | 'charged_back'`
   - `pending` → `authorized` (in `authorize_then_capture` mode)
   - `pending` → `paid` (in `immediate` capture mode)
   - `authorized` → `partially_captured` / `paid` (upon shipment capture)
   - `authorized` → `voided` (cancellation before capture)
   - `paid` → `partially_refunded` / `refunded` (upon refund or cancellation)
   - `paid` / `partially_refunded` → `disputed` → `charged_back`

3. **`OrderFulfillmentStatus` (Derived Aggregator)**: `'unfulfilled' | 'partially_fulfilled' | 'fulfilled'`
   - Pure function: `deriveFulfillmentStatus(orderItems, shipments)`
   - Sums shipped quantity per line item across all shipments for the order:
     - Total shipped == 0 → `'unfulfilled'`
     - 0 < Total shipped < Total ordered → `'partially_fulfilled'`
     - Total shipped == Total ordered → `'fulfilled'`

---

## 3. Database Schema & Data Migration

### 3.1 Entities & Tables

#### `shipments` Table
- `id` (UUIDv7, PK)
- `tenant_id` (UUID, FK `tenants.id`, indexed)
- `order_id` (UUID, FK `orders.id`, indexed)
- `carrier` (varchar(100))
- `tracking_number` (varchar(200), nullable)
- `tracking_url` (text, nullable)
- `status` (varchar(50), default `'shipped'`: `'shipped' | 'delivered' | 'returned'`)
- `shipped_at` (timestamptz, default `NOW()`)
- `created_at`, `updated_at`
- **RLS**: `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`.
- **Indexes**: `CREATE INDEX "shipments_tenant_order_idx" ON "shipments" ("tenant_id", "order_id")`

#### `shipment_items` Table
- `id` (UUIDv7, PK)
- `tenant_id` (UUID, FK `tenants.id`)
- `shipment_id` (UUID, FK `shipments.id`)
- `order_item_id` (UUID, FK `order_items.id`)
- `quantity` (int, CHECK `quantity > 0`)
- `created_at`, `updated_at`
- **RLS**: `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`.
- **Indexes**: `CREATE INDEX "shipment_items_tenant_shipment_idx" ON "shipment_items" ("tenant_id", "shipment_id")`

### 3.2 Schema Alterations & Data Backfill
- **`orders`**: Add `fulfillment_status` varchar(50) DEFAULT `'unfulfilled'`.
  - Data backfill mapping:
    - `pending_payment` → `status: 'pending'`, `payment_status: 'pending'`, `fulfillment_status: 'unfulfilled'`
    - `paid` / `processing` → `status: 'confirmed'`, `payment_status: 'paid'`, `fulfillment_status: 'unfulfilled'`
    - `shipped` → `status: 'confirmed'`, `payment_status: 'paid'`, `fulfillment_status: 'fulfilled'`
    - `delivered` → `status: 'completed'`, `payment_status: 'paid'`, `fulfillment_status: 'fulfilled'`
    - `cancelled` → `status: 'cancelled'`, `payment_status: 'voided'`, `fulfillment_status: 'unfulfilled'`
- **`tenant_settings`**: Add `capture_mode` varchar(50) DEFAULT `'immediate'` (CHECK `capture_mode IN ('immediate', 'authorize_then_capture')`).
- **`order_events`**: Add `provider_event_id` varchar(255) NULL.
  - Partial Unique Index:
    ```sql
    CREATE UNIQUE INDEX "order_events_tenant_provider_event_uidx"
      ON "order_events" ("tenant_id", "provider_event_id")
      WHERE "provider_event_id" IS NOT NULL;
    ```

---

## 4. Payment Infrastructure & Webhook Architecture

### 4.1 PaymentPort Contract & Registry
- Interface `PaymentPort` (`apps/api/src/payments/interfaces/payment-port.interface.ts`) implements ADR D7:
  - `authorize`, `capture`, `void`, `refund`, `parseEvent`, `createMerchantAccount`, `createOnboardingSession`, `getOnboardingStatus`.
- `MockPaymentProvider` updated to implement all D7 methods, deterministic test refs, and signed webhook parsing (`x-mock-signature`).
- `PaymentPortRegistry` (`apps/api/src/payments/providers/payment-port.registry.ts`):
  - Dynamically resolves active provider config per `tenantId` from `payment_provider_configs`.

### 4.2 Webhook Routing & Idempotency
- Route `POST /api/v1/payments/webhook`:
  - Excluded from `TenantResolutionMiddleware` (documented as Decision D2a exception #3 in `docs/architecture/architecture.md`).
  - Signature verification and event parsing via `PaymentPort.parseEvent(rawBody, headers)`.
  - Resolves `tenantId` from `NormalizedPaymentEvent.merchantAccount`.
  - Runs inside `tenantDb.run(tenantId, async (manager) => { ... })`.
  - Idempotency guard: Checks `order_events` for `(tenant_id, provider_event_id)`. If exists, returns 200 OK `{ received: true, status: 'already_processed' }`. If new, executes domain transition, records event, and returns 200 OK `{ received: true, status: 'processed' }`.

---

## 5. API Contracts & Controller Endpoints

1. **`POST /api/v1/merchant-admins/orders/:id/shipments`**
   - Guarded: `@Roles('owner', 'admin', 'staff')`
   - DTO (`CreateShipmentDto`): `carrier`, `trackingNumber`, `trackingUrl`, `items: [{ orderItemId, quantity }]`
   - Creates `Shipment` & `ShipmentItem` rows inside `tenantDb.run`.
   - Recomputes `fulfillment_status` via `deriveFulfillmentStatus`.
   - Under `authorize_then_capture`, triggers `PaymentPort.capture` for the shipped line items and updates `payment_status`.

2. **`POST /api/v1/merchant-admins/orders/:id/cancel`**
   - Guarded: `@Roles('owner', 'admin')`
   - Validates transition to `cancelled`.
   - Takes pessimistic write locks on `ProductVariant` rows and restores stock (resolves R8).
   - If `payment_status === 'authorized'`, calls `PaymentPort.void(...)` → `payment_status: 'voided'`.
   - If `payment_status === 'paid'`, calls `PaymentPort.refund(...)` → `payment_status: 'refunded'`.

---

## 6. Verification & Test Plan

1. **Pure Domain Unit Specs**:
   - `apps/api/src/orders/domain/__tests__/order-state-machine.spec.ts`: Tests every edge in the 3 state sub-machines.
   - `apps/api/src/orders/domain/__tests__/fulfillment-status-calculator.spec.ts`: Tests partial and full shipments.
   - `apps/api/src/payments/domain/__tests__/money.spec.ts`: Money arithmetic and validation.
2. **Provider & Webhook Specs**:
   - `apps/api/src/payments/__tests__/mock-payment-provider.spec.ts`: Tests D7 `PaymentPort` methods on Mock provider.
   - `apps/api/test/payments-webhook.e2e-spec.ts`: Tests signature parsing, tenant lookup, processing, and replay idempotency.
3. **Integration Specs**:
   - `apps/api/test/orders.e2e-spec.ts`: E2E tests for `immediate` and `authorize_then_capture` checkouts, shipments, cancellation stock locks & refunds.
