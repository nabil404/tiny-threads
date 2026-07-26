import {
  Entity,
  Column,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { TenantEntityBase } from './base';
import { Tenant } from './tenants.entity';
import { ProductVariant } from './product-variants.entity';
import { ProductCategory } from './product-categories.entity';

// status values are inferred; not enumerated in the schema doc.
export type ProductStatus = 'draft' | 'active' | 'archived';

@Entity({ name: 'products' })
@Index('products_tenant_status_idx', ['tenantId', 'status'])
@Index('products_tenant_created_idx', ['tenantId', 'createdAt'])
export class Product extends TenantEntityBase {
  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id', referencedColumnName: 'id' })
  tenant?: Tenant;

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text' })
  status!: ProductStatus;

  @OneToMany(() => ProductVariant, (variant) => variant.product)
  variants?: ProductVariant[];

  @OneToMany(
    () => ProductCategory,
    (productCategory) => productCategory.product,
  )
  productCategories?: ProductCategory[];
}
