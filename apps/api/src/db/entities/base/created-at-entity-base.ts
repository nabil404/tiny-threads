import { CreateDateColumn } from 'typeorm';

// Abstract, no @Entity — not part of the entities array. Base for
// natural-key tables (no surrogate id); subclasses declare their own
// @PrimaryColumn(s).
export abstract class CreatedAtEntityBase {
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
