import {
  Entity,
  Column,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { TenantEntityBase } from './base';
import { Customer } from './customers.entity';
import { CartItem } from './cart-items.entity';

export type CartStatus = 'active' | 'abandoned' | 'converted';

@Entity({ name: 'carts' })
@Index('carts_tenant_customer_idx', ['tenantId', 'customerId'])
@Index('carts_tenant_session_idx', ['tenantId', 'sessionId'])
@Index('carts_tenant_status_idx', ['tenantId', 'status'])
// One active cart per guest session and per customer. Partial so abandoned
// and converted carts can pile up freely, and so the two ownership kinds
// don't collide on each other's NULL column. See
// 1785310000000-AddCartsActiveUniqueIndexes.
@Index('carts_tenant_session_active_uidx', ['tenantId', 'sessionId'], {
  unique: true,
  where: `"status" = 'active' AND "session_id" IS NOT NULL`,
})
@Index('carts_tenant_customer_active_uidx', ['tenantId', 'customerId'], {
  unique: true,
  where: `"status" = 'active' AND "customer_id" IS NOT NULL`,
})
export class Cart extends TenantEntityBase {
  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId?: string | null;

  @Column({ name: 'session_id', type: 'text', nullable: true })
  sessionId?: string | null;

  @ManyToOne(() => Customer)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'customer_id', referencedColumnName: 'id' },
  ])
  customer?: Customer;

  @Column({ type: 'text' })
  status!: CartStatus;

  @OneToMany(() => CartItem, (item) => item.cart)
  items?: CartItem[];
}
