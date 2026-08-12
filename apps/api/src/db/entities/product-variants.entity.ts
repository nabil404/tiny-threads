import {
  Entity,
  Column,
  Index,
  Unique,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { TenantEntityBase } from './base';
import { Product } from './products.entity';
import { ProductVariantImage } from './product-variant-images.entity';

// Every product has at least one variant; simple goods get an
// auto-created default (isDefault). Order/cart lines reference variantId only.
@Entity({ name: 'product_variants' })
@Index('product_variants_tenant_product_idx', ['tenantId', 'productId'])
@Unique('product_variants_tenant_sku_uq', ['tenantId', 'sku'])
export class ProductVariant extends TenantEntityBase {
  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  // read-only; set productId to write the FK
  @ManyToOne(() => Product, (product) => product.variants)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'product_id', referencedColumnName: 'id' },
  ])
  product?: Product;

  @OneToMany(() => ProductVariantImage, (image) => image.variant)
  images?: ProductVariantImage[];

  @Column({ type: 'text', nullable: true })
  name!: string | null;

  @Column({ type: 'text' })
  sku!: string;

  @Column({ name: 'price_cents', type: 'int' })
  priceCents!: number;

  @Column({ type: 'int' })
  stock!: number;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault!: boolean;
}
