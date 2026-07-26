import {
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  BeforeInsert,
} from 'typeorm';
import { uuidv7 } from 'uuidv7';

// Abstract, no @Entity — not part of the entities array. Base for global
// (non-tenant-scoped) tables with a surrogate id PK.
export abstract class EntityBase {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  // Skipped if you `.save(plainLiteral)` instead of `repository.create(data)`.
  @BeforeInsert()
  generateId() {
    this.id ??= uuidv7();
  }
}
