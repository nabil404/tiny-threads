import { PrimaryColumn, CreateDateColumn, BeforeInsert } from 'typeorm';
import { uuidv7 } from 'uuidv7';

// Abstract, no @Entity — not part of the entities array. Same as EntityBase
// but no updated_at column (tenants/platform_admins are mutable but have
// none today).
export abstract class ImmutableEntityBase {
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
