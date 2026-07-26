import { Entity, PrimaryColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { CreatedAtEntityBase } from './base';
import { Product } from './products.entity';
import { Category } from './categories.entity';

// Many-to-many junction between products and categories. Natural composite
// key (tenantId, productId, categoryId) — no surrogate id, no generateId().
@Entity({ name: 'product_categories' })
@Index('product_categories_tenant_category_idx', ['tenantId', 'categoryId'])
export class ProductCategory extends CreatedAtEntityBase {
  @PrimaryColumn({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @PrimaryColumn({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @PrimaryColumn({ name: 'category_id', type: 'uuid' })
  categoryId!: string;

  // read-only; set productId to write the FK
  @ManyToOne(() => Product, (product) => product.productCategories)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'product_id', referencedColumnName: 'id' },
  ])
  product?: Product;

  // read-only; set categoryId to write the FK
  @ManyToOne(() => Category)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'category_id', referencedColumnName: 'id' },
  ])
  category?: Category;
}
