import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { EntityManager, FindOptionsWhere } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { ErrorCode } from '@tiny-threads/shared';
import { TenantDbService } from '../db/tenant-db.service';
import { PaymentsService } from '../payments/payments.service';
import { Order, OrderStatus } from '../db/entities/order.entity';
import { OrderEvent } from '../db/entities/order-event.entity';
import { ProductVariant } from '../db/entities/product-variants.entity';
import { Refund } from '../db/entities/refund.entity';
import { RefundOrderDto } from './dto/refund-order.dto';
import { OrderQueryDto } from './dto/order-query.dto';
import {
  CodedBadRequestException,
  CodedNotFoundException,
} from '../common/errors/coded-exceptions';

const VALID_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  pending_payment: ['paid', 'cancelled'],
  paid: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly paymentsService: PaymentsService,
    private readonly cls: ClsService,
  ) {}

  async transitionStatus(
    orderId: string,
    newStatus: OrderStatus,
    actorType: string,
    actorId?: string,
  ): Promise<Order> {
    return this.tenantDb.run(async (manager) => {
      const order = await manager.findOne(Order, {
        where: { id: orderId },
        relations: { items: true },
      });

      if (!order) {
        throw new CodedNotFoundException(
          ErrorCode.ORDER_NOT_FOUND,
          'Order not found',
        );
      }

      const allowedNext = VALID_TRANSITIONS[order.status] ?? [];
      if (!allowedNext.includes(newStatus)) {
        throw new CodedBadRequestException(
          ErrorCode.INVALID_ORDER_STATUS_TRANSITION,
          `Cannot transition order status from '${order.status}' to '${newStatus}'`,
        );
      }

      if (newStatus === 'cancelled') {
        await this.cancelOrderSideEffects(manager, order, actorType, actorId);
      }

      // A paid order must never be expired by the scheduler.
      if (newStatus === 'paid') {
        order.expiresAt = null;
      }

      order.status = newStatus;
      const savedOrder = await manager.save(Order, order);

      const tenantId = this.cls.get<string>('tenantId') || order.tenantId;

      const event = manager.create(OrderEvent, {
        tenantId,
        orderId: order.id,
        eventType: `status_changed_to_${newStatus}`,
        actorType,
        actorId: actorId ?? undefined,
      });
      await manager.save(OrderEvent, event);

      return savedOrder;
    });
  }

  async customerCancelOrder(
    customerId: string,
    orderId: string,
  ): Promise<Order> {
    return this.tenantDb.run(async (manager) => {
      const order = await manager.findOne(Order, {
        where: { id: orderId, customerId },
        relations: { items: true },
      });

      if (!order) {
        throw new CodedNotFoundException(
          ErrorCode.ORDER_NOT_FOUND,
          'Order not found',
        );
      }

      if (order.status !== 'pending_payment') {
        throw new CodedBadRequestException(
          ErrorCode.ORDER_CANNOT_BE_CANCELLED,
          `Only pending_payment orders can be cancelled by customer, but order status is '${order.status}'`,
        );
      }

      await this.cancelOrderSideEffects(manager, order, 'customer', customerId);

      order.status = 'cancelled';
      const savedOrder = await manager.save(Order, order);

      const tenantId = this.cls.get<string>('tenantId') || order.tenantId;

      const event = manager.create(OrderEvent, {
        tenantId,
        orderId: order.id,
        eventType: 'cancelled_by_customer',
        actorType: 'customer',
        actorId: customerId,
      });
      await manager.save(OrderEvent, event);

      return savedOrder;
    });
  }

  async getGuestOrder(orderId: string, token: string): Promise<Order> {
    if (!token) {
      throw new CodedNotFoundException(
        ErrorCode.ORDER_NOT_FOUND,
        'Guest access token is missing',
      );
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    return this.tenantDb.run(async (manager) => {
      const order = await manager.findOne(Order, {
        where: { id: orderId },
        relations: { items: true },
      });

      const supplied = Buffer.from(tokenHash, 'hex');
      const stored = order?.guestAccessTokenHash
        ? Buffer.from(order.guestAccessTokenHash, 'hex')
        : null;

      if (
        !order ||
        !stored ||
        stored.length !== supplied.length ||
        !crypto.timingSafeEqual(stored, supplied)
      ) {
        throw new CodedNotFoundException(
          ErrorCode.ORDER_NOT_FOUND,
          'Order not found',
        );
      }

      return order;
    });
  }

  async refundOrder(orderId: string, dto: RefundOrderDto): Promise<Refund> {
    return this.tenantDb.run(async (manager) => {
      const order = await manager.findOne(Order, {
        where: { id: orderId },
      });

      if (!order) {
        throw new CodedNotFoundException(
          ErrorCode.ORDER_NOT_FOUND,
          'Order not found',
        );
      }

      const refund = await this.paymentsService.refundPayment(
        orderId,
        dto.amountCents,
        dto.reason,
        manager,
      );

      const allRefunds = await manager.find(Refund, {
        where: { orderId },
      });

      const totalRefunded = allRefunds.reduce(
        (sum, r) => sum + r.amountCents,
        0,
      );

      if (totalRefunded >= order.totalCents) {
        order.paymentStatus = 'refunded';
      } else {
        order.paymentStatus = 'partially_refunded';
      }
      await manager.save(Order, order);

      const tenantId = this.cls.get<string>('tenantId') || order.tenantId;

      const event = manager.create(OrderEvent, {
        tenantId,
        orderId: order.id,
        eventType: 'refunded',
        actorType: 'admin',
        metadata: {
          amountCents: dto.amountCents,
          reason: dto.reason,
        },
      });
      await manager.save(OrderEvent, event);

      return refund;
    });
  }

  async getCustomerOrders(
    customerId: string,
    query: OrderQueryDto,
  ): Promise<{ items: Order[]; total: number; page: number; limit: number }> {
    return this.tenantDb.run(async (manager) => {
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;

      const where: FindOptionsWhere<Order> = { customerId };
      if (query.status) {
        where.status = query.status;
      }

      const [items, total] = await manager.findAndCount(Order, {
        where,
        relations: { items: true },
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });

      return { items, total, page, limit };
    });
  }

  async getCustomerOrderById(
    customerId: string,
    orderId: string,
  ): Promise<Order> {
    return this.tenantDb.run(async (manager) => {
      const order = await manager.findOne(Order, {
        where: { id: orderId, customerId },
        relations: { items: true },
      });

      if (!order) {
        throw new CodedNotFoundException(
          ErrorCode.ORDER_NOT_FOUND,
          'Order not found',
        );
      }

      return order;
    });
  }

  async getMerchantOrders(
    query: OrderQueryDto,
  ): Promise<{ items: Order[]; total: number; page: number; limit: number }> {
    return this.tenantDb.run(async (manager) => {
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;

      const where: FindOptionsWhere<Order> = {};
      if (query.status) {
        where.status = query.status;
      }

      const [items, total] = await manager.findAndCount(Order, {
        where,
        relations: { items: true },
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });

      return { items, total, page, limit };
    });
  }

  async getMerchantOrderById(orderId: string): Promise<Order> {
    return this.tenantDb.run(async (manager) => {
      const order = await manager.findOne(Order, {
        where: { id: orderId },
        relations: { items: true },
      });

      if (!order) {
        throw new CodedNotFoundException(
          ErrorCode.ORDER_NOT_FOUND,
          'Order not found',
        );
      }

      return order;
    });
  }

  /**
   * Shared "cancel" side effects used by both the admin/merchant
   * transition path and the customer self-cancel path: restores stock
   * for the order, and — if the order's payment was already captured —
   * refunds it and records a `refunded` OrderEvent. Keeping this in one
   * place means the two cancellation paths can't drift apart.
   */
  async cancelOrderSideEffects(
    manager: EntityManager,
    order: Order,
    actorType: string,
    actorId?: string,
  ): Promise<void> {
    await this.restoreStockForOrder(manager, order);

    if (
      order.paymentStatus === 'captured' ||
      order.paymentStatus === 'partially_refunded'
    ) {
      // A partially-refunded order (via the manual refundOrder endpoint)
      // still has a captured balance outstanding — refund exactly that
      // remainder, not the full order total, or refundPayment's
      // REFUND_EXCEEDS_PAYMENT guard would reject it.
      const existingRefunds = await manager.find(Refund, {
        where: { orderId: order.id },
      });
      const alreadyRefundedCents = existingRefunds.reduce(
        (sum, r) => sum + r.amountCents,
        0,
      );
      const remainingCents = order.totalCents - alreadyRefundedCents;

      if (remainingCents > 0) {
        await this.paymentsService.refundPayment(
          order.id,
          remainingCents,
          'Order cancelled',
          manager,
        );
        order.paymentStatus = 'refunded';

        const tenantId = this.cls.get<string>('tenantId') || order.tenantId;

        const refundEvent = manager.create(OrderEvent, {
          tenantId,
          orderId: order.id,
          eventType: 'refunded',
          actorType,
          actorId: actorId ?? undefined,
          metadata: {
            amountCents: remainingCents,
            reason: 'Order cancelled',
          },
        });
        await manager.save(OrderEvent, refundEvent);
      }
    }
  }

  private async restoreStockForOrder(
    manager: EntityManager,
    order: Order,
  ): Promise<void> {
    if (!order.items || order.items.length === 0) return;

    const items = [...order.items]
      .filter((i) => i.variantId)
      .sort((a, b) => a.variantId.localeCompare(b.variantId));

    for (const item of items) {
      const variant = await manager.findOne(ProductVariant, {
        where: { id: item.variantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (variant) {
        variant.stock += item.quantity;
        await manager.save(ProductVariant, variant);
      }
    }
  }
}
