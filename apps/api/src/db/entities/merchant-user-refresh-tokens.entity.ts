import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { ImmutableTenantEntityBase } from './base';
import { MerchantUser } from './merchant-users.entity';

@Entity({ name: 'merchant_user_refresh_tokens' })
@Index('merchant_user_refresh_tokens_tenant_merchant_user_idx', [
  'tenantId',
  'merchantUserId',
])
@Index('merchant_user_refresh_tokens_tenant_family_idx', [
  'tenantId',
  'familyId',
])
// See CustomerRefreshToken for why this is UNIQUE and not a plain index:
// token_hash is the only lookup key refresh()/logout() use, on an unbounded
// table.
@Unique('merchant_user_refresh_tokens_tenant_token_hash_uq', [
  'tenantId',
  'tokenHash',
])
export class MerchantUserRefreshToken extends ImmutableTenantEntityBase {
  @ManyToOne(() => MerchantUser)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'merchant_user_id', referencedColumnName: 'id' },
  ])
  merchantUser?: MerchantUser;

  @Column({ name: 'merchant_user_id', type: 'uuid' })
  merchantUserId!: string;

  @Column({ name: 'token_hash', type: 'text' })
  tokenHash!: string;

  @Column({ name: 'family_id', type: 'uuid' })
  familyId!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;
}
