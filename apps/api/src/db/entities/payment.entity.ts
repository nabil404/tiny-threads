import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { TenantEntityBase } from './base';
import { Order } from './order.entity';

@Entity({ name: 'payments' })
export class Payment extends TenantEntityBase {
  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @Column({ name: 'provider', type: 'varchar', default: 'mock' })
  provider!: string;

  @Column({
    name: 'provider_transaction_id',
    type: 'varchar',
    nullable: true,
  })
  providerTransactionId?: string;

  @Column({ name: 'status', type: 'varchar', default: 'pending' })
  status!: string;

  @Column({ name: 'amount_cents', type: 'integer' })
  amountCents!: number;

  @Column({ name: 'currency_code', type: 'varchar', default: 'USD' })
  currencyCode!: string;

  @Column({ name: 'raw_response', type: 'jsonb', nullable: true })
  rawResponse?: Record<string, any>;

  @ManyToOne(() => Order)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'order_id', referencedColumnName: 'id' },
  ])
  order?: Order;
}
