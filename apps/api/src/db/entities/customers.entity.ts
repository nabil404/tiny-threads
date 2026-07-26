import { Entity, Column, Index, Unique, ManyToOne, JoinColumn } from 'typeorm';
import { TenantEntityBase } from './base';
import { Tenant } from './tenants.entity';

// Customers belong to a tenant, not the platform — same email can exist
// under two merchants.
@Entity({ name: 'customers' })
@Index('customers_tenant_created_idx', ['tenantId', 'createdAt'])
@Unique('customers_tenant_email_uq', ['tenantId', 'email'])
export class Customer extends TenantEntityBase {
  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id', referencedColumnName: 'id' })
  tenant?: Tenant;

  @Column({ type: 'text' })
  email!: string;

  @Column({ type: 'text' })
  name!: string;
}
