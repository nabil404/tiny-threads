import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { TenantEntityBase } from './base';
import { Order } from './order.entity';

@Entity({ name: 'order_items' })
export class OrderItem extends TenantEntityBase {
  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @Column({ name: 'variant_id', type: 'uuid' })
  variantId!: string;

  @Column({ name: 'product_name', type: 'varchar' })
  productName!: string;

  @Column({ name: 'variant_name', type: 'varchar', nullable: true })
  variantName?: string;

  @Column({ name: 'sku', type: 'varchar' })
  sku!: string;

  @Column({ name: 'unit_price_cents', type: 'integer' })
  unitPriceCents!: number;

  @Column({ name: 'quantity', type: 'integer' })
  quantity!: number;

  @Column({ name: 'total_price_cents', type: 'integer' })
  totalPriceCents!: number;

  @ManyToOne(() => Order, (order) => order.items)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'order_id', referencedColumnName: 'id' },
  ])
  order?: Order;
}
