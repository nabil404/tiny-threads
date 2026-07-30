import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { TenantEntityBase } from './base';
import { Customer } from './customers.entity';
import { Country } from './countries.entity';

@Entity({ name: 'customer_addresses' })
@Index('customer_addresses_tenant_customer_idx', ['tenantId', 'customerId'])
export class CustomerAddress extends TenantEntityBase {
  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @ManyToOne(() => Customer)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'customer_id', referencedColumnName: 'id' },
  ])
  customer?: Customer;

  @Column({ name: 'first_name', type: 'text' })
  firstName!: string;

  @Column({ name: 'last_name', type: 'text' })
  lastName!: string;

  @Column({ type: 'text', nullable: true })
  company?: string | null;

  @Column({ type: 'text' })
  line1!: string;

  @Column({ type: 'text', nullable: true })
  line2?: string | null;

  @Column({ type: 'text' })
  city!: string;

  @Column({ name: 'state_province', type: 'text', nullable: true })
  stateProvince?: string | null;

  @Column({ name: 'postal_code', type: 'text' })
  postalCode!: string;

  @Column({ name: 'country_code', type: 'text' })
  countryCode!: string;

  @ManyToOne(() => Country)
  @JoinColumn({ name: 'country_code', referencedColumnName: 'code' })
  country?: Country;

  @Column({ type: 'text', nullable: true })
  phone?: string | null;

  @Column({ name: 'is_default_shipping', type: 'boolean', default: false })
  isDefaultShipping!: boolean;

  @Column({ name: 'is_default_billing', type: 'boolean', default: false })
  isDefaultBilling!: boolean;
}
