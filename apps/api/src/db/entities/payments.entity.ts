import {
  Entity,
  Column,
  Index,
  ManyToOne,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { TenantEntityBase } from './base';
import { Order } from './orders.entity';
import { PaymentProviderConfig } from './payment-provider-configs.entity';
import { Settlement } from './settlements.entity';

// Mirrors the payment-dimension vocabulary of the Orders state machine.
export type PaymentStatus =
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

@Entity({ name: 'payments' })
@Index('payments_tenant_order_idx', ['tenantId', 'orderId'])
export class Payment extends TenantEntityBase {
  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  // read-only; set orderId to write the FK
  @ManyToOne(() => Order, (order) => order.payments)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'order_id', referencedColumnName: 'id' },
  ])
  order?: Order;

  @Column({ name: 'provider_config_id', type: 'uuid' })
  providerConfigId!: string;

  // read-only; set providerConfigId to write the FK
  @ManyToOne(() => PaymentProviderConfig)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'provider_config_id', referencedColumnName: 'id' },
  ])
  providerConfig?: PaymentProviderConfig;

  @Column({ name: 'amount_cents', type: 'int' })
  amountCents!: number;

  @Column({ type: 'text' })
  status!: PaymentStatus;

  // Inverse, non-owning side — settlements.payment_id is the FK.
  @OneToOne(() => Settlement, (settlement) => settlement.payment)
  settlement?: Settlement;
}
