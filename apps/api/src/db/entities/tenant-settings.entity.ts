import { Entity, Column, Index } from 'typeorm';
import { TenantEntityBase } from './base';

@Index('tenant_settings_tenant_uidx', ['tenantId'], { unique: true })
@Entity({ name: 'tenant_settings' })
export class TenantSettings extends TenantEntityBase {
  @Column({ name: 'allow_guest_checkout', type: 'boolean', default: true })
  allowGuestCheckout!: boolean;

  @Column({
    name: 'platform_fee_percent',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 2.5,
    transformer: {
      to: (v: number) => v,
      from: (v: string | null) => (v === null ? v : Number(v)),
    },
  })
  platformFeePercent!: number;

  @Column({ name: 'default_currency_code', type: 'text', default: 'USD' })
  defaultCurrencyCode!: string;
}
