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
import { Customer } from './customers.entity';
import { Currency } from './currencies.entity';
import { OrderItem } from './order-items.entity';
import { OrderEvent } from './order-events.entity';
import { Payment } from './payments.entity';

// Dimension 1 (lifecycle) of the Orders state machine (backend-engineer skill).
export type OrderStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';

// Dimension 2 (payment) of the Orders state machine — supports both
// authorize_then_capture and immediate_capture store configs.
export type OrderPaymentStatus =
  | 'pending'
  | 'authorized'
  | 'paid'
  | 'partially_captured'
  | 'partially_refunded'
  | 'refunded'
  | 'disputed'
  | 'charged_back'
  | 'voided'
  | 'expired'
  | 'failed';

// RLS policy is declared in a raw-SQL migration, not here — TypeORM has no
// policy API. fulfillment_status is not a column: it will be derived from a
// future shipments sub-entity, never set directly.
@Entity({ name: 'orders' })
@Index('orders_tenant_created_idx', ['tenantId', 'createdAt'])
@Unique('orders_tenant_number_uq', ['tenantId', 'number'])
export class Order extends TenantEntityBase {
  @Column({ type: 'text' })
  number!: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  // read-only; set customerId to write the FK
  @ManyToOne(() => Customer)
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'customer_id', referencedColumnName: 'id' },
  ])
  customer?: Customer;

  @Column({ name: 'currency_code', type: 'text' })
  currencyCode!: string;

  // Currency is global reference data, not tenant-scoped — simple FK.
  @ManyToOne(() => Currency)
  @JoinColumn({ name: 'currency_code', referencedColumnName: 'code' })
  currency?: Currency;

  @Column({ type: 'text' })
  status!: OrderStatus;

  @Column({ name: 'payment_status', type: 'text' })
  paymentStatus!: OrderPaymentStatus;

  @Column({ name: 'total_cents', type: 'int' })
  totalCents!: number;

  @OneToMany(() => OrderItem, (item) => item.order)
  items?: OrderItem[];

  @OneToMany(() => OrderEvent, (event) => event.order)
  events?: OrderEvent[];

  @OneToMany(() => Payment, (payment) => payment.order)
  payments?: Payment[];
}
