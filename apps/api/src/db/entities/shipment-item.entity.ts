import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { TenantEntityBase } from './base';
import { Shipment } from './shipment.entity';
import { OrderItem } from './order-item.entity';

@Index('shipment_items_tenant_shipment_idx', ['tenantId', 'shipmentId'])
@Entity({ name: 'shipment_items' })
export class ShipmentItem extends TenantEntityBase {
  @Column({ name: 'shipment_id', type: 'uuid' })
  shipmentId!: string;

  @ManyToOne(() => Shipment, (s) => s.items, { onDelete: 'CASCADE' })
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'shipment_id', referencedColumnName: 'id' },
  ])
  shipment!: Shipment;

  @Column({ name: 'order_item_id', type: 'uuid' })
  orderItemId!: string;

  @ManyToOne(() => OrderItem, { onDelete: 'CASCADE' })
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'order_item_id', referencedColumnName: 'id' },
  ])
  orderItem!: OrderItem;

  @Column({ type: 'int' })
  quantity!: number;
}
