import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { TenantEntityBase } from './base';
import { Customer } from './customers.entity';
import { Country } from './countries.entity';

@Entity({ name: 'customer_addresses' })
@Index('customer_addresses_tenant_customer_idx', ['tenantId', 'customerId'])
export class CustomerAddress extends TenantEntityBase {
  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  // read-only; set customerId to write the FK
  @ManyToOne(() => Customer)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'customer_id', referencedColumnName: 'id' },
  ])
  customer?: Customer;

  @Column({ type: 'text' })
  line1!: string;

  @Column({ name: 'country_code', type: 'text' })
  countryCode!: string;

  // Country is global; simple FK, not composite.
  @ManyToOne(() => Country)
  @JoinColumn({ name: 'country_code', referencedColumnName: 'code' })
  country?: Country;
}
