import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { ImmutableTenantEntityBase } from './base';
import { Customer } from './customers.entity';

@Entity({ name: 'customer_identities' })
@Index('customer_identities_tenant_customer_idx', ['tenantId', 'customerId'])
@Unique('customer_identities_tenant_provider_subject_uq', [
  'tenantId',
  'provider',
  'providerSubject',
])
@Unique('customer_identities_tenant_customer_provider_uq', [
  'tenantId',
  'customerId',
  'provider',
])
export class CustomerIdentity extends ImmutableTenantEntityBase {
  @ManyToOne(() => Customer)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'customer_id', referencedColumnName: 'id' },
  ])
  customer?: Customer;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

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
