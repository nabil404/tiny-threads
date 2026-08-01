import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { ImmutableTenantEntityBase } from './base';
import { Order } from './order.entity';

@Index('order_events_tenant_order_created_idx', [
  'tenantId',
  'orderId',
  'createdAt',
])
@Entity({ name: 'order_events' })
export class OrderEvent extends ImmutableTenantEntityBase {
  @Column({ name: 'order_id', type: 'uuid', nullable: true })
  orderId?: string | null;

  @Column({ name: 'event_type', type: 'varchar' })
  eventType!: string;

  @Column({ name: 'actor_type', type: 'varchar' })
  actorType!: string;

  @Column({ name: 'actor_id', type: 'varchar', nullable: true })
  actorId?: string;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @Column({
    name: 'provider_event_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  providerEventId!: string | null;

  @ManyToOne(() => Order)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'order_id', referencedColumnName: 'id' },
  ])
  order?: Order;
}
