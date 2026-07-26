import { Entity, PrimaryColumn, Column } from 'typeorm';
import { CreatedAtEntityBase } from './base';

// Global catalog of supported payment providers; per-tenant connections
// live in payment_provider_configs, not here.
@Entity({ name: 'payment_providers' })
export class PaymentProvider extends CreatedAtEntityBase {
  @PrimaryColumn({ type: 'text' })
  code!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ name: 'supports_split', type: 'boolean' })
  supportsSplit!: boolean;
}
