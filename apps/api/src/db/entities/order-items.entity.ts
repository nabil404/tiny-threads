import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { ImmutableTenantEntityBase } from './base';
import { Order } from './orders.entity';
import { ProductVariant } from './product-variants.entity';

// Price snapshot pattern — nameSnapshot/priceCentsSnapshot are captured at
// purchase time so historical orders don't change when catalog prices do.
@Entity({ name: 'order_items' })
@Index('order_items_tenant_order_idx', ['tenantId', 'orderId'])
export class OrderItem extends ImmutableTenantEntityBase {
  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  // read-only; set orderId to write the FK
  @ManyToOne(() => Order, (order) => order.items)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'order_id', referencedColumnName: 'id' },
  ])
  order?: Order;

  @Column({ name: 'variant_id', type: 'uuid' })
  variantId!: string;

  // read-only; set variantId to write the FK
  @ManyToOne(() => ProductVariant)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'variant_id', referencedColumnName: 'id' },
  ])
  variant?: ProductVariant;

  @Column({ name: 'name_snapshot', type: 'text' })
  nameSnapshot!: string;

  @Column({ name: 'price_cents_snapshot', type: 'int' })
  priceCentsSnapshot!: number;

  @Column({ type: 'int' })
  qty!: number;
}
