import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { TenantEntityBase } from './base';
import { Payment } from './payment.entity';
import { Order } from './order.entity';

@Index('refunds_tenant_payment_idx', ['tenantId', 'paymentId'])
@Index('refunds_tenant_order_idx', ['tenantId', 'orderId'])
@Entity({ name: 'refunds' })
export class Refund extends TenantEntityBase {
  @Column({ name: 'payment_id', type: 'uuid' })
  paymentId!: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @Column({ name: 'amount_cents', type: 'integer' })
  amountCents!: number;

  @Column({ name: 'reason', type: 'varchar', nullable: true })
  reason?: string;

  @Column({ name: 'status', type: 'varchar', default: 'completed' })
  status!: string;

  @Column({ name: 'provider_refund_id', type: 'varchar', nullable: true })
  providerRefundId?: string;

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
