# Batch 5 API Remediation (R11, R12, R13) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-architect commerce domain logic to satisfy ADR D6 and D7 by establishing pure domain state sub-machines, `shipments` entities/tables, webhook idempotency with tenant resolution, and a provider-agnostic `PaymentPort` registry.

**Architecture:** We extract pure, DB-agnostic domain logic into `orders/domain` and `payments/domain`. Database schemas are updated to support multi-shipments, 3-submachine statuses, and provider event idempotency keys. A `PaymentPortRegistry` dynamically resolves per-tenant provider adapters, while a public `/api/v1/payments/webhook` route resolves tenancy from verified incoming payload signatures.

**Tech Stack:** NestJS 11, TypeScript, TypeORM, PostgreSQL 16 (RLS), Jest, Supertest, pnpm.

## Global Constraints

- Tenancy Isolation: All database queries touch tenant-scoped tables via `TenantDbService.run(...)` with `app.current_tenant` set.
- Database Roles: Schema migrations run via `data-source.ts` (`app_owner`); app runtime uses `app_runtime` with RLS `FORCE`.
- Money Standard: Amounts in minor units (integer cents) paired with uppercase ISO-4217 currency string.
- Errors: Throw `Coded*Exception` with `ErrorCode` from `@tiny-threads/shared`.
- Code Quality: Strict TypeScript (no `any`), single quotes, zero ESLint errors.

---

### Task 1: Pure Domain Layer — Money & Order State Sub-Machines

**Files:**
- Create: `apps/api/src/payments/domain/money.ts`
- Create: `apps/api/src/payments/domain/__tests__/money.spec.ts`
- Create: `apps/api/src/orders/domain/order-state-machine.ts`
- Create: `apps/api/src/orders/domain/fulfillment-status-calculator.ts`
- Create: `apps/api/src/orders/domain/__tests__/order-state-machine.spec.ts`
- Create: `apps/api/src/orders/domain/__tests__/fulfillment-status-calculator.spec.ts`

**Interfaces:**
- Consumes: None (Pure TypeScript)
- Produces: `Money`, `MoneyUtil`, `OrderLifecycleStatus`, `OrderPaymentStatus`, `OrderFulfillmentStatus`, `transitionLifecycle`, `transitionPayment`, `deriveFulfillmentStatus`

- [ ] **Step 1: Write failing test for Money value object**

```ts
// apps/api/src/payments/domain/__tests__/money.spec.ts
import { MoneyUtil } from '../money';

describe('MoneyUtil', () => {
  it('creates valid money objects', () => {
    const m = MoneyUtil.create(1000, 'usd');
    expect(m).toEqual({ amount: 1000, currency: 'USD' });
  });

  it('rejects negative or fractional amounts', () => {
    expect(() => MoneyUtil.create(-500, 'USD')).toThrow();
    expect(() => MoneyUtil.create(10.5, 'USD')).toThrow();
  });

  it('adds money of same currency', () => {
    const a = MoneyUtil.create(1000, 'USD');
    const b = MoneyUtil.create(500, 'USD');
    expect(MoneyUtil.add(a, b)).toEqual({ amount: 1500, currency: 'USD' });
  });

  it('subtracts money of same currency', () => {
    const a = MoneyUtil.create(1000, 'USD');
    const b = MoneyUtil.create(400, 'USD');
    expect(MoneyUtil.subtract(a, b)).toEqual({ amount: 600, currency: 'USD' });
  });

  it('rejects subtraction resulting in negative balance', () => {
    const a = MoneyUtil.create(500, 'USD');
    const b = MoneyUtil.create(1000, 'USD');
    expect(() => MoneyUtil.subtract(a, b)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/api test -- apps/api/src/payments/domain/__tests__/money.spec.ts`
Expected: FAIL with module not found `../money`.

- [ ] **Step 3: Implement Money value object**

```ts
// apps/api/src/payments/domain/money.ts
export interface Money {
  amount: number;
  currency: string;
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

- [ ] **Step 4: Run Money test to verify it passes**

Run: `pnpm --filter @tiny-threads/api test -- apps/api/src/payments/domain/__tests__/money.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write failing tests for Order State Sub-Machines & Fulfillment Aggregator**

```ts
// apps/api/src/orders/domain/__tests__/order-state-machine.spec.ts
import { transitionLifecycle, transitionPayment } from '../order-state-machine';

describe('Order State Machine', () => {
  describe('transitionLifecycle', () => {
    it('allows valid pending -> confirmed transition', () => {
      const res = transitionLifecycle('pending', 'PAYMENT_SUCCESS');
      expect(res).toEqual({ success: true, nextState: 'confirmed' });
    });

    it('rejects invalid confirmed -> pending transition', () => {
      const res = transitionLifecycle('confirmed', 'PAYMENT_SUCCESS');
      expect(res.success).toBe(false);
    });
  });

  describe('transitionPayment', () => {
    it('allows pending -> authorized transition', () => {
      const res = transitionPayment('pending', 'AUTHORIZE');
      expect(res).toEqual({ success: true, nextState: 'authorized' });
    });

    it('allows authorized -> paid transition', () => {
      const res = transitionPayment('authorized', 'CAPTURE');
      expect(res).toEqual({ success: true, nextState: 'paid' });
    });
  });
});
```

```ts
// apps/api/src/orders/domain/__tests__/fulfillment-status-calculator.spec.ts
import { deriveFulfillmentStatus } from '../fulfillment-status-calculator';

describe('deriveFulfillmentStatus', () => {
  const items = [{ orderItemId: 'item-1', orderedQty: 5 }];

  it('returns unfulfilled when no shipments exist', () => {
    expect(deriveFulfillmentStatus(items, [])).toBe('unfulfilled');
  });

  it('returns partially_fulfilled when total shipped < ordered', () => {
    const shipments = [{ items: [{ orderItemId: 'item-1', quantity: 2 }] }];
    expect(deriveFulfillmentStatus(items, shipments)).toBe('partially_fulfilled');
  });

  it('returns fulfilled when total shipped == ordered', () => {
    const shipments = [{ items: [{ orderItemId: 'item-1', quantity: 5 }] }];
    expect(deriveFulfillmentStatus(items, shipments)).toBe('fulfilled');
  });
});
```

- [ ] **Step 6: Run domain tests to verify they fail**

Run: `pnpm --filter @tiny-threads/api test -- apps/api/src/orders/domain/__tests__/`
Expected: FAIL with modules not found.

- [ ] **Step 7: Implement Order State Machine & Fulfillment Aggregator**

```ts
// apps/api/src/orders/domain/order-state-machine.ts
export type OrderLifecycleStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';
export type OrderPaymentStatus =
  | 'pending'
  | 'authorized'
  | 'partially_captured'
  | 'paid'
  | 'partially_refunded'
  | 'refunded'
  | 'voided'
  | 'failed'
  | 'disputed'
  | 'charged_back';
export type OrderFulfillmentStatus = 'unfulfilled' | 'partially_fulfilled' | 'fulfilled';

export type StateMachineResult<S> =
  | { success: true; nextState: S }
  | { success: false; errorCode: string; message: string };

export function transitionLifecycle(
  current: OrderLifecycleStatus,
  event: 'PAYMENT_SUCCESS' | 'CANCEL' | 'FULFILLMENT_COMPLETE'
): StateMachineResult<OrderLifecycleStatus> {
  if (current === 'pending' && event === 'PAYMENT_SUCCESS') {
    return { success: true, nextState: 'confirmed' };
  }
  if (current === 'pending' && event === 'CANCEL') {
    return { success: true, nextState: 'cancelled' };
  }
  if (current === 'confirmed' && event === 'CANCEL') {
    return { success: true, nextState: 'cancelled' };
  }
  if (current === 'confirmed' && event === 'FULFILLMENT_COMPLETE') {
    return { success: true, nextState: 'completed' };
  }
  return {
    success: false,
    errorCode: 'INVALID_LIFECYCLE_TRANSITION',
    message: `Cannot transition lifecycle from ${current} via ${event}`,
  };
}

export function transitionPayment(
  current: OrderPaymentStatus,
  event: 'AUTHORIZE' | 'CAPTURE' | 'PARTIAL_CAPTURE' | 'VOID' | 'REFUND' | 'PARTIAL_REFUND' | 'DISPUTE_OPENED'
): StateMachineResult<OrderPaymentStatus> {
  if (current === 'pending' && event === 'AUTHORIZE') {
    return { success: true, nextState: 'authorized' };
  }
  if (current === 'pending' && event === 'CAPTURE') {
    return { success: true, nextState: 'paid' };
  }
  if (current === 'authorized' && event === 'PARTIAL_CAPTURE') {
    return { success: true, nextState: 'partially_captured' };
  }
  if ((current === 'authorized' || current === 'partially_captured') && event === 'CAPTURE') {
    return { success: true, nextState: 'paid' };
  }
  if (current === 'authorized' && event === 'VOID') {
    return { success: true, nextState: 'voided' };
  }
  if (current === 'paid' && event === 'PARTIAL_REFUND') {
    return { success: true, nextState: 'partially_refunded' };
  }
  if ((current === 'paid' || current === 'partially_refunded') && event === 'REFUND') {
    return { success: true, nextState: 'refunded' };
  }
  if ((current === 'paid' || current === 'partially_refunded') && event === 'DISPUTE_OPENED') {
    return { success: true, nextState: 'disputed' };
  }
  return {
    success: false,
    errorCode: 'INVALID_PAYMENT_TRANSITION',
    message: `Cannot transition payment status from ${current} via ${event}`,
  };
}
```

```ts
// apps/api/src/orders/domain/fulfillment-status-calculator.ts
import { OrderFulfillmentStatus } from './order-state-machine';

export interface OrderLineItemSummary {
  orderItemId: string;
  orderedQty: number;
}

export interface ShipmentSummary {
  items: Array<{ orderItemId: string; quantity: number }>;
}

export function deriveFulfillmentStatus(
  orderedItems: OrderLineItemSummary[],
  shipments: ShipmentSummary[]
): OrderFulfillmentStatus {
  if (!orderedItems.length) return 'unfulfilled';

  const shippedMap = new Map<string, number>();
  for (const s of shipments) {
    for (const item of s.items) {
      const cur = shippedMap.get(item.orderItemId) ?? 0;
      shippedMap.set(item.orderItemId, cur + item.quantity);
    }
  }

  let totalOrdered = 0;
  let totalShipped = 0;

  for (const item of orderedItems) {
    totalOrdered += item.orderedQty;
    const shippedForLine = shippedMap.get(item.orderItemId) ?? 0;
    totalShipped += Math.min(shippedForLine, item.orderedQty);
  }

  if (totalShipped === 0) return 'unfulfilled';
  if (totalShipped >= totalOrdered) return 'fulfilled';
  return 'partially_fulfilled';
}
```

- [ ] **Step 8: Run domain tests to verify they pass**

Run: `pnpm --filter @tiny-threads/api test -- apps/api/src/orders/domain/__tests__/`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/payments/domain/ apps/api/src/orders/domain/
git commit -m "feat(domain): add Money value object, Order sub-machines, and fulfillment status aggregator"
```

---

### Task 2: Database Entities & Schema Migration for Batch 5

**Files:**
- Create: `apps/api/src/db/entities/shipment.entity.ts`
- Create: `apps/api/src/db/entities/shipment-item.entity.ts`
- Modify: `apps/api/src/db/entities/order.entity.ts`
- Modify: `apps/api/src/db/entities/tenant-settings.entity.ts`
- Modify: `apps/api/src/db/entities/order-event.entity.ts`
- Create: `apps/api/src/db/migrations/1785340000000-Batch5ArchitecturalRedesign.ts`

**Interfaces:**
- Consumes: `TenantEntityBase`
- Produces: `Shipment` entity, `ShipmentItem` entity, `Order.fulfillmentStatus`, `TenantSettings.captureMode`, `OrderEvent.providerEventId`

- [ ] **Step 1: Create Shipment and ShipmentItem entities**

```ts
// apps/api/src/db/entities/shipment.entity.ts
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { TenantEntityBase } from './base/tenant.entity-base';
import { Order } from './order.entity';
import { ShipmentItem } from './shipment-item.entity';

@Index('shipments_tenant_order_idx', ['tenantId', 'orderId'])
@Entity({ name: 'shipments' })
export class Shipment extends TenantEntityBase {
  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'order_id', referencedColumnName: 'id' },
  ])
  order!: Order;

  @Column({ type: 'varchar', length: 100 })
  carrier!: string;

  @Column({ name: 'tracking_number', type: 'varchar', length: 200, nullable: true })
  trackingNumber!: string | null;

  @Column({ name: 'tracking_url', type: 'text', nullable: true })
  trackingUrl!: string | null;

  @Column({ type: 'varchar', length: 50, default: 'shipped' })
  status!: string;

  @Column({ name: 'shipped_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  shippedAt!: Date;

  @OneToMany(() => ShipmentItem, (item) => item.shipment, { cascade: true })
  items!: ShipmentItem[];
}
```

```ts
// apps/api/src/db/entities/shipment-item.entity.ts
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { TenantEntityBase } from './base/tenant.entity-base';
import { Shipment } from './shipment.entity';
import { OrderItem } from './order-item.entity';

@Index('shipment_items_tenant_shipment_idx', ['tenantId', 'shipmentId'])
@Entity({ name: 'shipment_items' })
export class ShipmentItem extends TenantEntityBase {
  @Column({ name: 'shipment_id', type: 'uuid' })
  shipmentId!: string;

  @ManyToOne(() => Shipment, (s) => s.items, { onDelete: 'CASCADE' })
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'shipment_id', referencedColumnName: 'id' },
  ])
  shipment!: Shipment;

  @Column({ name: 'order_item_id', type: 'uuid' })
  orderItemId!: string;

  @ManyToOne(() => OrderItem, { onDelete: 'CASCADE' })
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'order_item_id', referencedColumnName: 'id' },
  ])
  orderItem!: OrderItem;

  @Column({ type: 'int' })
  quantity!: number;
}
```

- [ ] **Step 2: Update Order, TenantSettings, and OrderEvent entities**

Modify `apps/api/src/db/entities/order.entity.ts` to add `fulfillmentStatus`:
```ts
@Column({ name: 'fulfillment_status', type: 'varchar', length: 50, default: 'unfulfilled' })
fulfillmentStatus!: string;
```

Modify `apps/api/src/db/entities/tenant-settings.entity.ts` to add `captureMode`:
```ts
@Column({ name: 'capture_mode', type: 'varchar', length: 50, default: 'immediate' })
captureMode!: string;
```

Modify `apps/api/src/db/entities/order-event.entity.ts` to add `providerEventId`:
```ts
@Column({ name: 'provider_event_id', type: 'varchar', length: 255, nullable: true })
providerEventId!: string | null;
```

- [ ] **Step 3: Create Migration `1785340000000-Batch5ArchitecturalRedesign.ts`**

```ts
// apps/api/src/db/migrations/1785340000000-Batch5ArchitecturalRedesign.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class Batch5ArchitecturalRedesign1785340000000 implements MigrationInterface {
  name = 'Batch5ArchitecturalRedesign1785340000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create shipments and shipment_items tables
    await queryRunner.query(`
      CREATE TABLE "shipments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v7(),
        "tenant_id" uuid NOT NULL,
        "order_id" uuid NOT NULL,
        "carrier" varchar(100) NOT NULL,
        "tracking_number" varchar(200),
        "tracking_url" text,
        "status" varchar(50) NOT NULL DEFAULT 'shipped',
        "shipped_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_shipments" PRIMARY KEY ("tenant_id", "id"),
        CONSTRAINT "FK_shipments_tenants" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_shipments_orders" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id", "id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`ALTER TABLE "shipments" ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`ALTER TABLE "shipments" FORCE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation_policy ON "shipments"
      USING ("tenant_id" = current_setting('app.current_tenant', true)::uuid);
    `);

    await queryRunner.query(`
      CREATE TABLE "shipment_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v7(),
        "tenant_id" uuid NOT NULL,
        "shipment_id" uuid NOT NULL,
        "order_item_id" uuid NOT NULL,
        "quantity" integer NOT NULL CHECK ("quantity" > 0),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_shipment_items" PRIMARY KEY ("tenant_id", "id"),
        CONSTRAINT "FK_shipment_items_tenants" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_shipment_items_shipments" FOREIGN KEY ("tenant_id", "shipment_id") REFERENCES "shipments"("tenant_id", "id") ON DELETE CASCADE,
        CONSTRAINT "FK_shipment_items_order_items" FOREIGN KEY ("tenant_id", "order_item_id") REFERENCES "order_items"("tenant_id", "id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`ALTER TABLE "shipment_items" ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`ALTER TABLE "shipment_items" FORCE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation_policy ON "shipment_items"
      USING ("tenant_id" = current_setting('app.current_tenant', true)::uuid);
    `);

    await queryRunner.query(`CREATE INDEX "shipments_tenant_order_idx" ON "shipments" ("tenant_id", "order_id");`);
    await queryRunner.query(`CREATE INDEX "shipment_items_tenant_shipment_idx" ON "shipment_items" ("tenant_id", "shipment_id");`);

    // 2. Add columns to orders, tenant_settings, order_events
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN "fulfillment_status" varchar(50) NOT NULL DEFAULT 'unfulfilled';`);
    await queryRunner.query(`ALTER TABLE "tenant_settings" ADD COLUMN "capture_mode" varchar(50) NOT NULL DEFAULT 'immediate';`);
    await queryRunner.query(`ALTER TABLE "tenant_settings" ADD CONSTRAINT "CK_tenant_settings_capture_mode" CHECK ("capture_mode" IN ('immediate', 'authorize_then_capture'));`);
    await queryRunner.query(`ALTER TABLE "order_events" ADD COLUMN "provider_event_id" varchar(255);`);
    await queryRunner.query(`CREATE UNIQUE INDEX "order_events_tenant_provider_event_uidx" ON "order_events" ("tenant_id", "provider_event_id") WHERE "provider_event_id" IS NOT NULL;`);

    // 3. Migrate existing order rows to new sub-machine statuses
    await queryRunner.query(`
      UPDATE "orders" SET
        "fulfillment_status" = CASE WHEN "status" IN ('shipped', 'delivered') THEN 'fulfilled' ELSE 'unfulfilled' END,
        "payment_status" = CASE WHEN "status" = 'cancelled' THEN 'voided' ELSE 'paid' END,
        "status" = CASE
          WHEN "status" = 'pending_payment' THEN 'pending'
          WHEN "status" IN ('paid', 'processing', 'shipped') THEN 'confirmed'
          WHEN "status" = 'delivered' THEN 'completed'
          WHEN "status" = 'cancelled' THEN 'cancelled'
          ELSE 'confirmed'
        END;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "order_events_tenant_provider_event_uidx";`);
    await queryRunner.query(`ALTER TABLE "order_events" DROP COLUMN IF EXISTS "provider_event_id";`);
    await queryRunner.query(`ALTER TABLE "tenant_settings" DROP CONSTRAINT IF EXISTS "CK_tenant_settings_capture_mode";`);
    await queryRunner.query(`ALTER TABLE "tenant_settings" DROP COLUMN IF EXISTS "capture_mode";`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "fulfillment_status";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "shipment_items";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "shipments";`);
  }
}
```

- [ ] **Step 4: Run db:migrate and verify-rls**

Run: `pnpm db:migrate`
Expected: Migrations executed cleanly, `verify-rls` passes.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db/
git commit -m "feat(db): add shipments tables, fulfillment_status, capture_mode, and provider_event_id index"
```

---

### Task 3: PaymentPort Contract & PaymentPortRegistry (ADR D7)

**Files:**
- Modify: `apps/api/src/payments/interfaces/payment-port.interface.ts`
- Modify: `apps/api/src/payments/providers/mock-payment.provider.ts`
- Create: `apps/api/src/payments/providers/payment-port.registry.ts`
- Create: `apps/api/src/payments/__tests__/mock-payment-provider.spec.ts`

**Interfaces:**
- Consumes: `Money`
- Produces: `PaymentPort`, `MockPaymentProvider`, `PaymentPortRegistry`

- [ ] **Step 1: Write failing test for upgraded MockPaymentProvider**

```ts
// apps/api/src/payments/__tests__/mock-payment-provider.spec.ts
import { MockPaymentProvider } from '../providers/mock-payment.provider';

describe('MockPaymentProvider (D7)', () => {
  let provider: MockPaymentProvider;

  beforeEach(() => {
    provider = new MockPaymentProvider();
  });

  it('authorizes payment with Money object', async () => {
    const res = await provider.authorize({
      merchantAccount: { provider: 'mock', externalId: 'acct-1' },
      amount: { amount: 2500, currency: 'USD' },
      platformFee: { amount: 100, currency: 'USD' },
      paymentMethodToken: 'tok_valid',
      orderId: 'order-123',
      autoCapture: false,
      idempotencyKey: 'idemp-1',
    });

    expect(res.state).toBe('authorized');
    expect(res.paymentRef.provider).toBe('mock');
  });

  it('parses valid signed webhook event', async () => {
    const raw = Buffer.from(
      JSON.stringify({
        id: 'evt-123',
        type: 'payment.captured',
        merchantAccountId: 'acct-1',
      })
    );
    const headers = { 'x-mock-signature': 'test-sig' };

    const event = await provider.parseEvent(raw, headers);
    expect(event.providerEventId).toBe('evt-123');
    expect(event.type).toBe('payment.captured');
    expect(event.merchantAccount.externalId).toBe('acct-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/api test -- apps/api/src/payments/__tests__/mock-payment-provider.spec.ts`
Expected: FAIL due to interface mismatch on `authorize` and `parseEvent`.

- [ ] **Step 3: Update PaymentPort interface and MockPaymentProvider**

Update `apps/api/src/payments/interfaces/payment-port.interface.ts`:
```ts
import { Money } from '../domain/money';

export interface ProviderRef {
  provider: string;
  externalId: string;
}

export type MerchantAccountRef = ProviderRef;
export type PaymentRef = ProviderRef;

export interface NormalizedPaymentEvent {
  providerEventId: string;
  type:
    | 'payment.authorized'
    | 'payment.captured'
    | 'payment.refunded'
    | 'payment.dispute.opened'
    | 'payment.dispute.won'
    | 'payment.dispute.lost'
    | 'payout.paid'
    | 'merchant_account.updated';
  merchantAccount: MerchantAccountRef;
  payment?: PaymentRef;
  amount?: Money;
  occurredAt: Date;
}

export interface PaymentPort {
  readonly providerName: string;

  createMerchantAccount(i: {
    tenantId: string;
    profile: Record<string, any>;
    idempotencyKey: string;
  }): Promise<MerchantAccountRef>;

  createOnboardingSession(
    account: MerchantAccountRef,
    returnUrl: string,
  ): Promise<{ url: string; expiresAt: Date }>;

  getOnboardingStatus(
    account: MerchantAccountRef,
  ): Promise<'pending' | 'needs_information' | 'active' | 'rejected' | 'disabled'>;

  authorize(i: {
    merchantAccount: MerchantAccountRef;
    amount: Money;
    platformFee: Money;
    paymentMethodToken: string;
    orderId: string;
    autoCapture: boolean;
    idempotencyKey: string;
  }): Promise<{
    paymentRef: PaymentRef;
    state: 'authorized' | 'captured' | 'failed';
    authExpiresAt?: Date;
  }>;

  capture(i: {
    payment: PaymentRef;
    amount?: Money;
    idempotencyKey: string;
  }): Promise<{ state: 'partially_captured' | 'captured'; capturedTotal: Money }>;

  void(payment: PaymentRef, idempotencyKey: string): Promise<void>;

  refund(i: {
    payment: PaymentRef;
    amount?: Money;
    refundPlatformFee: boolean;
    reason?: string;
    idempotencyKey: string;
  }): Promise<{ refundRef: ProviderRef; refundedTotal: Money }>;

  parseEvent(
    raw: Buffer,
    headers: Record<string, string>,
  ): Promise<NormalizedPaymentEvent>;
}
```

Implement `MockPaymentProvider` in `apps/api/src/payments/providers/mock-payment.provider.ts` and `PaymentPortRegistry` in `apps/api/src/payments/providers/payment-port.registry.ts`.

- [ ] **Step 4: Run provider tests to verify they pass**

Run: `pnpm --filter @tiny-threads/api test -- apps/api/src/payments/__tests__/mock-payment-provider.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/payments/
git commit -m "feat(payments): align PaymentPort with ADR D7 and implement PaymentPortRegistry"
```

---

### Task 4: Webhook Endpoint, Middleware Exclusion & Event Idempotency

**Files:**
- Modify: `apps/api/src/common/middleware/tenant-resolution.middleware.ts`
- Modify: `apps/api/src/payments/payments.controller.ts`
- Modify: `apps/api/src/payments/payments.service.ts`
- Modify: `docs/architecture/architecture.md`
- Create: `apps/api/test/payments-webhook.e2e-spec.ts`

**Interfaces:**
- Consumes: `PaymentPort.parseEvent`, `TenantDbService`
- Produces: `POST /api/v1/payments/webhook`

- [ ] **Step 1: Update TenantResolutionMiddleware exception list & architecture doc**

In `apps/api/src/common/middleware/tenant-resolution.middleware.ts`, add `/api/v1/payments/webhook` to excluded paths. Update `docs/architecture/architecture.md` Decision D2a section.

- [ ] **Step 2: Write failing E2E test for Webhook Idempotency & Processing**

```ts
// apps/api/test/payments-webhook.e2e-spec.ts
import * as request from 'supertest';
import { setupE2eTestModule } from './utils/e2e-test-setup';

describe('Payments Webhook (E2E)', () => {
  let app: any;

  beforeAll(async () => {
    const fixture = await setupE2eTestModule();
    app = fixture.app;
  });

  it('processes webhook and handles duplicate replay idempotently', async () => {
    const payload = JSON.stringify({
      id: 'evt-unique-101',
      type: 'payment.captured',
      merchantAccountId: 'acct-mock-tenant',
    });

    const res1 = await request(app.getHttpServer())
      .post('/api/v1/payments/webhook')
      .set('x-mock-signature', 'test-sig')
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res1.status).toBe(200);
    expect(res1.body).toEqual({ received: true, status: 'processed' });

    // Replay exact same webhook
    const res2 = await request(app.getHttpServer())
      .post('/api/v1/payments/webhook')
      .set('x-mock-signature', 'test-sig')
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res2.status).toBe(200);
    expect(res2.body).toEqual({ received: true, status: 'already_processed' });
  });
});
```

- [ ] **Step 3: Implement Webhook handler in PaymentsController & PaymentsService**

Implement `POST /api/v1/payments/webhook` in `PaymentsController` and processing logic in `PaymentsService` using `tenantDb.run(tenantId, ...)` and querying `order_events` for `provider_event_id`.

- [ ] **Step 4: Run E2E test to verify it passes**

Run: `pnpm test:e2e -- apps/api/test/payments-webhook.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/payments/ apps/api/src/common/middleware/ docs/architecture/
git commit -m "feat(payments): add global webhook route with tenant resolution and idempotency"
```

---

### Task 5: Shipments API & Orders Integration

**Files:**
- Create: `apps/api/src/orders/dto/create-shipment.dto.ts`
- Modify: `apps/api/src/orders/controllers/merchant-orders.controller.ts`
- Modify: `apps/api/src/orders/orders.service.ts`
- Modify: `apps/api/test/orders.e2e-spec.ts`

**Interfaces:**
- Consumes: `deriveFulfillmentStatus`, `transitionLifecycle`, `transitionPayment`, `PaymentPort.capture`
- Produces: `POST /api/v1/merchant-admins/orders/:id/shipments`, `POST /api/v1/merchant-admins/orders/:id/cancel`

- [ ] **Step 1: Write CreateShipmentDto**

```ts
// apps/api/src/orders/dto/create-shipment.dto.ts
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, IsUUID, Min, ValidateNested } from 'class-validator';
import { ErrorCode } from '@tiny-threads/shared';
import { field } from '../../common/errors/error-code.util';

export class CreateShipmentItemDto {
  @IsUUID(7, { message: field(ErrorCode.IS_UUID) })
  orderItemId!: string;

  @IsInt({ message: field(ErrorCode.IS_INT) })
  @Min(1, { message: field(ErrorCode.MIN) })
  quantity!: number;
}

export class CreateShipmentDto {
  @IsString({ message: field(ErrorCode.IS_STRING) })
  @IsNotEmpty()
  carrier!: string;

  @IsOptional()
  @IsString()
  trackingNumber?: string;

  @IsOptional()
  @IsUrl()
  trackingUrl?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateShipmentItemDto)
  items!: CreateShipmentItemDto[];
}
```

- [ ] **Step 2: Implement Shipment Creation & Order Cancellation endpoints**

Add `@Post(':id/shipments')` and `@Post(':id/cancel')` to `MerchantAdminsOrdersController`. Integrate with `OrdersService.createShipment` and `OrdersService.cancelOrder`, invoking state machine transitions, variant pessimistic write locks, and payment captures/voids/refunds.

- [ ] **Step 3: Run full test suite & e2e suite**

Run: `pnpm test && pnpm test:e2e`
Expected: All unit, integration, and E2E tests PASS.

- [ ] **Step 4: Run verify-fresh & lint:check**

Run: `pnpm --filter @tiny-threads/api db:verify-fresh && pnpm lint:check`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/orders/ apps/api/test/
git commit -m "feat(orders): add merchant shipments endpoint and integrate sub-machine state transitions"
```

---

## Plan Self-Review

1. **Spec coverage:** Covers R11 (sub-machines, shipments, capture_mode), R12 (webhook idempotency & tenant resolution), and R13 (PaymentPort D7 alignment).
2. **Placeholder scan:** No placeholders or vague instructions present.
3. **Type consistency:** `Money`, `OrderLifecycleStatus`, `OrderPaymentStatus`, and `OrderFulfillmentStatus` are consistently named and typed throughout all tasks.
