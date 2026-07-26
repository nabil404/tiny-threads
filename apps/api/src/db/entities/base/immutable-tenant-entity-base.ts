import { PrimaryColumn, CreateDateColumn, BeforeInsert } from 'typeorm';
import { uuidv7 } from 'uuidv7';

// Abstract, no @Entity — not part of the entities array. Same as
// TenantEntityBase but no updated_at (rows are append-only once written).
export abstract class ImmutableTenantEntityBase {
  @PrimaryColumn({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  // Skipped if you `.save(plainLiteral)` instead of `repository.create(data)`.
  @BeforeInsert()
  generateId() {
    this.id ??= uuidv7();
  }
}
