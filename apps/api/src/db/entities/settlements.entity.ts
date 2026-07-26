import { Entity, Column, Unique, OneToOne, JoinColumn } from 'typeorm';
import { TenantEntityBase } from './base';
import { Payment } from './payments.entity';

// status values are inferred; not enumerated in the schema doc.
export type SettlementStatus = 'pending' | 'settled' | 'reversed';

// Own table (not folded into payments): split-settlement has its own
// lifecycle. Unique (tenantId, paymentId) makes this one-to-zero-or-one.
@Entity({ name: 'settlements' })
@Unique('settlements_tenant_payment_uq', ['tenantId', 'paymentId'])
export class Settlement extends TenantEntityBase {
  @Column({ name: 'payment_id', type: 'uuid' })
  paymentId!: string;

  // Owning side of the one-to-one; set paymentId above to write the FK.
  @OneToOne(() => Payment)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'payment_id', referencedColumnName: 'id' },
  ])
  payment?: Payment;

  @Column({ name: 'merchant_cents', type: 'int' })
  merchantCents!: number;

  @Column({ name: 'platform_fee_cents', type: 'int' })
  platformFeeCents!: number;

  @Column({ type: 'text' })
  status!: SettlementStatus;
}
