import { Entity, Column } from 'typeorm';
import { TenantEntityBase } from './base';

@Entity({ name: 'tenant_settings' })
export class TenantSettings extends TenantEntityBase {
  @Column({ name: 'allow_guest_checkout', type: 'boolean', default: true })
  allowGuestCheckout!: boolean;

  @Column({
    name: 'platform_fee_percent',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 2.50,
  })
  platformFeePercent!: number;
}
