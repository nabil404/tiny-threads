import { Entity, Column, OneToMany } from 'typeorm';
import { TenantEntityBase } from './base';
import { OrderItem } from './order-item.entity';

@Entity({ name: 'orders' })
export class Order extends TenantEntityBase {
  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId?: string;

  @Column({ name: 'customer_email', type: 'varchar' })
  customerEmail!: string;

  @Column({ name: 'status', type: 'varchar', default: 'pending_payment' })
  status!: string;

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
  expiresAt?: Date;

  @OneToMany(() => OrderItem, (item) => item.order)
  items?: OrderItem[];
}
