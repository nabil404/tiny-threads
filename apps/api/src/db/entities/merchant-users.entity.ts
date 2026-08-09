import { Entity, Column, Index, Unique, ManyToOne, JoinColumn } from 'typeorm';
import { TenantEntityBase } from './base';
import { Tenant } from './tenants.entity';

@Entity({ name: 'merchant_users' })
@Index('merchant_users_tenant_created_idx', ['tenantId', 'createdAt'])
@Unique('merchant_users_tenant_email_uq', ['tenantId', 'email'])
export class MerchantUser extends TenantEntityBase {
  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id', referencedColumnName: 'id' })
  tenant?: Tenant;

  @Column({ type: 'text' })
  email!: string;

  @Column({ type: 'text' })
  role!: string;

  @Column({ type: 'text', nullable: true })
  locale!: string | null;
}
