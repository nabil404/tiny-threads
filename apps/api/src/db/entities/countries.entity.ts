import { Entity, PrimaryColumn, Column } from 'typeorm';
import { CreatedAtEntityBase } from './base';

// Global reference data — natural key (ISO country code), no surrogate id.
@Entity({ name: 'countries' })
export class Country extends CreatedAtEntityBase {
  @PrimaryColumn({ type: 'text' })
  code!: string;

  @Column({ type: 'text' })
  name!: string;
}
