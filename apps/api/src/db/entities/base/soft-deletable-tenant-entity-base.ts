import { DeleteDateColumn } from 'typeorm';
import { TenantEntityBase } from './tenant-entity-base';

// Abstract, no @Entity — not part of the entities array. Same as
// TenantEntityBase with an additional soft delete timestamp column.
export abstract class SoftDeletableTenantEntityBase extends TenantEntityBase {
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date | null;
}
