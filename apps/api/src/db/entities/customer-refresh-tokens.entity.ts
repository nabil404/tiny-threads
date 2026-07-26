import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ImmutableTenantEntityBase } from './base';
import { Customer } from './customers.entity';

@Entity({ name: 'customer_refresh_tokens' })
@Index('customer_refresh_tokens_tenant_customer_idx', [
  'tenantId',
  'customerId',
])
@Index('customer_refresh_tokens_tenant_family_idx', ['tenantId', 'familyId'])
export class CustomerRefreshToken extends ImmutableTenantEntityBase {
  @ManyToOne(() => Customer)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'customer_id', referencedColumnName: 'id' },
  ])
  customer?: Customer;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ name: 'token_hash', type: 'text' })
  tokenHash!: string;

  @Column({ name: 'family_id', type: 'uuid' })
  familyId!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;
}
