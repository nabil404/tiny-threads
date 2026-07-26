import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { ImmutableTenantEntityBase } from './base';
import { MerchantUser } from './merchant-users.entity';

@Entity({ name: 'merchant_user_identities' })
@Index('merchant_user_identities_tenant_merchant_user_idx', [
  'tenantId',
  'merchantUserId',
])
@Unique('merchant_user_identities_tenant_provider_subject_uq', [
  'tenantId',
  'provider',
  'providerSubject',
])
@Unique('merchant_user_identities_tenant_merchant_user_provider_uq', [
  'tenantId',
  'merchantUserId',
  'provider',
])
export class MerchantUserIdentity extends ImmutableTenantEntityBase {
  @ManyToOne(() => MerchantUser)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'merchant_user_id', referencedColumnName: 'id' },
  ])
  merchantUser?: MerchantUser;

  @Column({ name: 'merchant_user_id', type: 'uuid' })
  merchantUserId!: string;

  @Column({ type: 'text' })
  provider!: 'password' | 'google';

  @Column({ name: 'provider_subject', type: 'text', nullable: true })
  providerSubject!: string | null;

  @Column({ name: 'password_hash', type: 'text', nullable: true })
  passwordHash!: string | null;

  @Column({ name: 'email_verified', type: 'boolean', default: false })
  emailVerified!: boolean;

  @Column({ name: 'verification_token_hash', type: 'text', nullable: true })
  verificationTokenHash!: string | null;

  @Column({
    name: 'verification_token_expires_at',
    type: 'timestamptz',
    nullable: true,
  })
  verificationTokenExpiresAt!: Date | null;

  @Column({ name: 'password_reset_token_hash', type: 'text', nullable: true })
  passwordResetTokenHash!: string | null;

  @Column({
    name: 'password_reset_token_expires_at',
    type: 'timestamptz',
    nullable: true,
  })
  passwordResetTokenExpiresAt!: Date | null;
}
