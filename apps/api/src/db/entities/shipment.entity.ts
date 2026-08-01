import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { TenantEntityBase } from './base';
import { Order } from './order.entity';
import { ShipmentItem } from './shipment-item.entity';

@Index('shipments_tenant_order_idx', ['tenantId', 'orderId'])
@Entity({ name: 'shipments' })
export class Shipment extends TenantEntityBase {
  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'order_id', referencedColumnName: 'id' },
  ])
  order!: Order;

  @Column({ type: 'varchar', length: 100 })
  carrier!: string;

  @Column({ name: 'tracking_number', type: 'varchar', length: 200, nullable: true })
  trackingNumber!: string | null;

  @Column({ name: 'tracking_url', type: 'text', nullable: true })
  trackingUrl!: string | null;

  @Column({ type: 'varchar', length: 50, default: 'shipped' })
  status!: string;

  @Column({ name: 'shipped_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  shippedAt!: Date;

  @OneToMany(() => ShipmentItem, (item) => item.shipment, { cascade: true })
  items!: ShipmentItem[];
}
