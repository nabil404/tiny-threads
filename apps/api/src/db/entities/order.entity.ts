import { Entity, Column, OneToMany, Index } from 'typeorm';
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

@Index('orders_tenant_customer_created_idx', [
  'tenantId',
  'customerId',
  'createdAt',
])
@Index('orders_tenant_status_created_idx', ['tenantId', 'status', 'createdAt'])
@Index('orders_tenant_created_idx', ['tenantId', 'createdAt'])
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

  @Column({
    name: 'fulfillment_status',
    type: 'varchar',
    length: 50,
    default: 'unfulfilled',
  })
  fulfillmentStatus!: string;

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
