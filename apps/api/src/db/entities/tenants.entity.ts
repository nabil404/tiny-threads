import { Entity, Column } from 'typeorm';
import { ImmutableEntityBase } from './base';

// Global table — a tenant IS the scope, so no RLS policy.
@Entity({ name: 'tenants' })
export class Tenant extends ImmutableEntityBase {
  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', unique: true })
  slug!: string;
}
