import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { TenantEntityBase } from './base';
import { ProductVariant } from './product-variants.entity';

@Entity({ name: 'product_variant_images' })
@Index('product_variant_images_tenant_variant_idx', [
  'tenantId',
  'variantId',
  'sortOrder',
])
export class ProductVariantImage extends TenantEntityBase {
  @Column({ name: 'variant_id', type: 'uuid' })
  variantId!: string;

  @ManyToOne(() => ProductVariant, (variant) => variant.images, {
    onDelete: 'CASCADE',
  })
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'variant_id', referencedColumnName: 'id' },
  ])
  variant?: ProductVariant;

  @Column({ name: 'storage_key', type: 'text' })
  storageKey!: string;

  @Column({ type: 'text' })
  url!: string;

  @Column({ name: 'alt_text', type: 'text', nullable: true })
  altText!: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary!: boolean;
}
