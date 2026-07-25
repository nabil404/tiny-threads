import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  BeforeInsert,
} from 'typeorm';
import { uuidv7 } from 'uuidv7';

// Global table — a tenant IS the scope, so it is never filtered by tenant_id
// and carries no RLS policy.
@Entity({ name: 'tenants' })
export class Tenant {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', unique: true })
  slug!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  // Runs only on a real entity instance — always go through
  // `repository.create(data)` before `.save()`, never `.save(plainLiteral)`,
  // or this hook (and any other entity lifecycle logic) is silently skipped.
  @BeforeInsert()
  generateId() {
    this.id ??= uuidv7();
  }
}
