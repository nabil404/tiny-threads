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

// status values are inferred; not enumerated in the schema doc.
export type CartStatus = 'active' | 'abandoned' | 'converted';

// Server-side persisted cart, not client-side — enables cross-device carts.
@Entity({ name: 'carts' })
@Index('carts_tenant_customer_idx', ['tenantId', 'customerId'])
@Index('carts_tenant_status_idx', ['tenantId', 'status'])
export class Cart extends TenantEntityBase {
  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  // read-only; set customerId to write the FK
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
