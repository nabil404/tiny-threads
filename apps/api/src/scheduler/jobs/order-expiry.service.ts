import { Injectable, Logger } from '@nestjs/common';
import { DataSource, LessThanOrEqual } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { TenantDbService } from '../../db/tenant-db.service';
import { OrdersService } from '../../orders/orders.service';
import { Order } from '../../db/entities/order.entity';
import { OrderEvent } from '../../db/entities/order-event.entity';
import { Tenant } from '../../db/entities/tenants.entity';

@Injectable()
export class OrderExpiryService {
  private readonly logger = new Logger(OrderExpiryService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cls: ClsService,
    private readonly tenantDb: TenantDbService,
    private readonly ordersService: OrdersService,
  ) {}

  /**
   * Scans all tenants for pending_payment orders whose expires_at has
   * passed, cancels them (restoring stock and refunding if needed), and
   * records an order_expired event.
   *
   * Each tenant is processed in its own CLS context + transaction with
   * tenant context re-established, per the backend-engineer skill's
   * invariant #6: "Background jobs carry tenantId and re-establish tenant
   * context in the worker before any DB access."
   */
  async expireStaleOrders(): Promise<void> {
    // tenants is a global table (no RLS), so DataSource is fine here.
    const tenants = await this.dataSource.getRepository(Tenant).find();

    for (const tenant of tenants) {
      try {
        await this.expireOrdersForTenant(tenant.id);
      } catch (error) {
        // Log and continue — one tenant's failure must not block others.
        this.logger.error(
          `Failed to expire orders for tenant ${tenant.id}: ${error}`,
        );
      }
    }
  }

  private async expireOrdersForTenant(tenantId: string): Promise<void> {
    // withTenant (called by tenantDb.run) reads tenantId from CLS and
    // throws if absent. Background jobs have no HTTP request, so CLS is
    // empty. We create a fresh CLS context and populate it ourselves.
    await this.cls.run(async () => {
      this.cls.set('tenantId', tenantId);

      await this.tenantDb.run(async (manager) => {
        const now = new Date();

        const expiredOrders = await manager.find(Order, {
          where: {
            status: 'pending',
            expiresAt: LessThanOrEqual(now),
          },
          relations: { items: true },
          lock: { mode: 'pessimistic_write' },
        });

        if (expiredOrders.length === 0) return;

        this.logger.log(
          `Expiring ${expiredOrders.length} order(s) for tenant ${tenantId}`,
        );

        for (const order of expiredOrders) {
          await this.ordersService.cancelOrderSideEffects(
            manager,
            order,
            'system',
          );

          order.status = 'cancelled';
          order.expiresAt = null;
          await manager.save(Order, order);

          const event = manager.create(OrderEvent, {
            tenantId,
            orderId: order.id,
            eventType: 'order_expired',
            actorType: 'system',
          });
          await manager.save(OrderEvent, event);
        }
      });
    });
  }
}
