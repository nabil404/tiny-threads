import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
  Unique,
  BeforeInsert,
} from 'typeorm';
import { uuidv7 } from 'uuidv7';

// Worked example of a tenant-scoped table. Composite (tenant_id, id) PK per
// docs/architecture/database-schema.md, so every FK into orders is composite
// and a cross-tenant reference is physically impossible.
//
// RLS (ENABLE + FORCE + the tenant_isolation policy) is NOT declarable here —
// TypeORM has no policy API. It is created in a raw-SQL migration; see
// apps/api/src/db/migrations. This entity purely describes columns/
// constraints — the security boundary lives in that migration.
@Entity({ name: 'orders' })
@Index('orders_tenant_created_idx', ['tenantId', 'createdAt'])
@Unique('orders_tenant_number_uq', ['tenantId', 'number'])
export class Order {
  @PrimaryColumn({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  number!: string;

  @Column({ type: 'text' })
  status!: string;

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
