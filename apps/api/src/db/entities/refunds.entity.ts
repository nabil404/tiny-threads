import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { ImmutableTenantEntityBase } from './base';
import { Payment } from './payments.entity';
import { Settlement } from './settlements.entity';

// Refunds claw back from a settlement, not the raw payment event —
// settlementId is NOT NULL; would need to become nullable for pre-settlement
// refunds/voids.
@Entity({ name: 'refunds' })
@Index('refunds_tenant_payment_idx', ['tenantId', 'paymentId'])
@Index('refunds_tenant_settlement_idx', ['tenantId', 'settlementId'])
export class Refund extends ImmutableTenantEntityBase {
  @Column({ name: 'payment_id', type: 'uuid' })
  paymentId!: string;

  // read-only; set paymentId to write the FK
  @ManyToOne(() => Payment)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'payment_id', referencedColumnName: 'id' },
  ])
  payment?: Payment;

  @Column({ name: 'settlement_id', type: 'uuid' })
  settlementId!: string;

  // read-only; set settlementId to write the FK
  @ManyToOne(() => Settlement)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'settlement_id', referencedColumnName: 'id' },
  ])
  settlement?: Settlement;

  @Column({ name: 'amount_cents', type: 'int' })
  amountCents!: number;
}
