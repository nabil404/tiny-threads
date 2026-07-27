import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { ImmutableTenantEntityBase } from './base';
import { Customer } from './customers.entity';

@Entity({ name: 'customer_refresh_tokens' })
@Index('customer_refresh_tokens_tenant_customer_idx', [
  'tenantId',
  'customerId',
])
@Index('customer_refresh_tokens_tenant_family_idx', ['tenantId', 'familyId'])
// token_hash is the ONLY lookup key refresh()/logout() use, on a table that
// grows unbounded with every login — without an index each rotation degrades
// to a full scan. UNIQUE rather than a plain index because a hash collision
// across two live tokens would make the lookup ambiguous, and the constraint
// makes that impossible at the storage layer instead of hoping for it.
@Unique('customer_refresh_tokens_tenant_token_hash_uq', [
  'tenantId',
  'tokenHash',
])
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
