import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { TenantEntityBase } from './base';
import { Payment } from './payment.entity';
import { Order } from './order.entity';

@Entity({ name: 'settlements' })
export class Settlement extends TenantEntityBase {
  @Column({ name: 'payment_id', type: 'uuid' })
  paymentId!: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @Column({ name: 'gross_amount_cents', type: 'integer' })
  grossAmountCents!: number;

  @Column({ name: 'platform_fee_cents', type: 'integer' })
  platformFeeCents!: number;

  @Column({ name: 'merchant_net_amount_cents', type: 'integer' })
  merchantNetAmountCents!: number;

  @Column({ name: 'status', type: 'varchar', default: 'settled' })
  status!: string;

  @ManyToOne(() => Payment)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'payment_id', referencedColumnName: 'id' },
  ])
  payment?: Payment;

  @ManyToOne(() => Order)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'order_id', referencedColumnName: 'id' },
  ])
  order?: Order;
}
