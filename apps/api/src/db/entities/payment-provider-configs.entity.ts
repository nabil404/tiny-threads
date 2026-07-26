import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { TenantEntityBase } from './base';
import { Tenant } from './tenants.entity';
import { PaymentProvider } from './payment-providers.entity';

// One row per merchant-provider connection; no uniqueness on
// (tenantId, providerCode) since a tenant may connect the same provider twice.
@Entity({ name: 'payment_provider_configs' })
@Index('payment_provider_configs_tenant_provider_idx', [
  'tenantId',
  'providerCode',
])
export class PaymentProviderConfig extends TenantEntityBase {
  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id', referencedColumnName: 'id' })
  tenant?: Tenant;

  @Column({ name: 'provider_code', type: 'text' })
  providerCode!: string;

  @ManyToOne(() => PaymentProvider)
  @JoinColumn({ name: 'provider_code', referencedColumnName: 'code' })
  provider?: PaymentProvider;

  @Column({ name: 'account_ref', type: 'text' })
  accountRef!: string;

  @Column({ type: 'boolean' })
  enabled!: boolean;
}
