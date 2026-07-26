import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { ImmutableTenantEntityBase } from './base';
import { MerchantUser } from './merchant-users.entity';

@Entity({ name: 'merchant_user_invites' })
@Index('merchant_user_invites_tenant_email_idx', ['tenantId', 'email'])
@Unique('merchant_user_invites_tenant_token_hash_uq', ['tenantId', 'tokenHash'])
export class MerchantUserInvite extends ImmutableTenantEntityBase {
  @Column({ type: 'text' })
  email!: string;

  // The role to grant on redemption — validated against the allowed role
  // set at the DTO level when the invite is issued (InviteMemberDto), not
  // here; the entity just stores whatever role was approved at issue time.
  @Column({ type: 'text' })
  role!: string;

  @Column({ name: 'token_hash', type: 'text' })
  tokenHash!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  // Set on redemption — null means still outstanding. This is what makes
  // the invite single-use (see MerchantAdminsAuthService.register()).
  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt!: Date | null;

  // Audit trail only — who issued this invite. Nullable since there's no
  // hard requirement that every invite trace back to a still-existing
  // merchant user, same laxness as other optional FKs in this codebase.
  @ManyToOne(() => MerchantUser)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'invited_by_merchant_user_id', referencedColumnName: 'id' },
  ])
  invitedByMerchantUser?: MerchantUser;

  @Column({
    name: 'invited_by_merchant_user_id',
    type: 'uuid',
    nullable: true,
  })
  invitedByMerchantUserId!: string | null;
}
