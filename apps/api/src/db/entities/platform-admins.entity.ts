import { Entity, Column, Unique } from 'typeorm';
import { ImmutableEntityBase } from './base';

// Global table — platform staff operate across tenants, so no RLS.
@Entity({ name: 'platform_admins' })
@Unique('platform_admins_email_uq', ['email'])
export class PlatformAdmin extends ImmutableEntityBase {
  @Column({ type: 'text' })
  email!: string;

  @Column({ type: 'text' })
  role!: string;
}
