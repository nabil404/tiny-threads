import { Entity, Column, Index, Unique, ManyToOne, JoinColumn } from 'typeorm';
import { ImmutableTenantEntityBase } from './base';
import { Order } from './orders.entity';

// Append-only audit trail and idempotency key for order state transitions.
// providerEventId is nullable (manual transitions have none); Postgres
// treats multiple NULLs as distinct, so dedupe still holds for real events.
@Entity({ name: 'order_events' })
@Index('order_events_tenant_order_idx', ['tenantId', 'orderId'])
@Index('order_events_tenant_created_idx', ['tenantId', 'createdAt'])
@Unique('order_events_tenant_provider_event_uq', [
  'tenantId',
  'providerEventId',
])
export class OrderEvent extends ImmutableTenantEntityBase {
  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  // read-only; set orderId to write the FK
  @ManyToOne(() => Order, (order) => order.events)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'order_id', referencedColumnName: 'id' },
  ])
  order?: Order;

  @Column({ type: 'text' })
  type!: string;

  @Column({ name: 'provider_event_id', type: 'text', nullable: true })
  providerEventId!: string | null;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;
}
