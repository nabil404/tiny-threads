import { Entity, PrimaryColumn, Column } from 'typeorm';
import { CreatedAtEntityBase } from './base';

// Global reference data — natural key (ISO currency code), no surrogate id.
@Entity({ name: 'currencies' })
export class Currency extends CreatedAtEntityBase {
  @PrimaryColumn({ type: 'text' })
  code!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text' })
  symbol!: string;
}
