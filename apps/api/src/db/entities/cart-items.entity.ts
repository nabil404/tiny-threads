import { Entity, Column, Index, Unique, ManyToOne, JoinColumn } from 'typeorm';
import { TenantEntityBase } from './base';
import { Cart } from './carts.entity';
import { ProductVariant } from './product-variants.entity';

@Entity({ name: 'cart_items' })
@Index('cart_items_tenant_cart_idx', ['tenantId', 'cartId'])
@Unique('cart_items_tenant_cart_variant_uq', [
  'tenantId',
  'cartId',
  'variantId',
])
export class CartItem extends TenantEntityBase {
  @Column({ name: 'cart_id', type: 'uuid' })
  cartId!: string;

  // read-only; set cartId to write the FK
  @ManyToOne(() => Cart, (cart) => cart.items)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'cart_id', referencedColumnName: 'id' },
  ])
  cart?: Cart;

  @Column({ name: 'variant_id', type: 'uuid' })
  variantId!: string;

  // read-only; set variantId to write the FK
  @ManyToOne(() => ProductVariant)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'variant_id', referencedColumnName: 'id' },
  ])
  variant?: ProductVariant;

  @Column({ type: 'int' })
  qty!: number;
}
