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
import { Shipment } from '../db/entities/shipment.entity';
import { ShipmentItem } from '../db/entities/shipment-item.entity';
import { TenantSettings } from '../db/entities/tenant-settings.entity';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { RefundOrderDto } from './dto/refund-order.dto';
import { OrderQueryDto } from './dto/order-query.dto';
import { deriveFulfillmentStatus } from './domain/fulfillment-status-calculator';
import {
  transitionLifecycle,
  transitionPayment,
} from './domain/order-state-machine';
import {
  CodedBadRequestException,
  CodedNotFoundException,
} from '../common/errors/coded-exceptions';

const VALID_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
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

      // A confirmed order must never be expired by the scheduler.
      if (newStatus === 'confirmed') {
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

      if (order.status !== 'pending') {
        throw new CodedBadRequestException(
          ErrorCode.ORDER_CANNOT_BE_CANCELLED,
          `Only pending orders can be cancelled by customer, but order status is '${order.status}'`,
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

  async createShipment(
    orderId: string,
    dto: CreateShipmentDto,
    actorId?: string,
  ): Promise<Shipment> {
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

      if (order.status === 'cancelled') {
        throw new CodedBadRequestException(
          ErrorCode.INVALID_ORDER_STATUS_TRANSITION,
          'Cannot create shipment for a cancelled order',
        );
      }

      if (!dto.items || dto.items.length === 0) {
        throw new CodedBadRequestException(
          ErrorCode.VALIDATION_FAILED,
          'Shipment items cannot be empty',
        );
      }

      const existingShipments = await manager.find(Shipment, {
        where: { orderId: order.id },
        relations: { items: true },
      });

      const shippedMap = new Map<string, number>();
      for (const s of existingShipments) {
        for (const item of s.items || []) {
          const cur = shippedMap.get(item.orderItemId) ?? 0;
          shippedMap.set(item.orderItemId, cur + item.quantity);
        }
      }

      for (const itemDto of dto.items) {
        const orderItem = order.items?.find(
          (i) => i.id === itemDto.orderItemId,
        );
        if (!orderItem) {
          throw new CodedBadRequestException(
            ErrorCode.VALIDATION_FAILED,
            `Order item '${itemDto.orderItemId}' not found in order`,
          );
        }

        const currentShipped = shippedMap.get(itemDto.orderItemId) ?? 0;
        if (currentShipped + itemDto.quantity > orderItem.quantity) {
          throw new CodedBadRequestException(
            ErrorCode.VALIDATION_FAILED,
            `Shipment quantity (${currentShipped + itemDto.quantity}) exceeds ordered quantity (${orderItem.quantity}) for order item ${itemDto.orderItemId}`,
          );
        }
      }

      const tenantId = this.cls.get<string>('tenantId') || order.tenantId;

      const shipment = manager.create(Shipment, {
        tenantId,
        orderId: order.id,
        carrier: dto.carrier,
        trackingNumber: dto.trackingNumber ?? null,
        trackingUrl: dto.trackingUrl ?? null,
        status: 'shipped',
        shippedAt: new Date(),
      });

      const savedShipment = await manager.save(Shipment, shipment);

      const shipmentItems = dto.items.map((itemDto) =>
        manager.create(ShipmentItem, {
          tenantId,
          shipmentId: savedShipment.id,
          orderItemId: itemDto.orderItemId,
          quantity: itemDto.quantity,
        }),
      );

      await manager.save(ShipmentItem, shipmentItems);
      savedShipment.items = shipmentItems;

      const allShipments = [...existingShipments, savedShipment];
      const orderedItems = (order.items || []).map((i) => ({
        orderItemId: i.id,
        orderedQty: i.quantity,
      }));

      const newFulfillmentStatus = deriveFulfillmentStatus(
        orderedItems,
        allShipments,
      );
      order.fulfillmentStatus = newFulfillmentStatus;

      if (newFulfillmentStatus === 'fulfilled') {
        const res = transitionLifecycle(order.status, 'FULFILLMENT_COMPLETE');
        if (res.success) {
          order.status = res.nextState;
        } else {
          order.status = 'completed';
        }
      }

      const tenantSettings = await manager.findOne(TenantSettings, {
        where: { tenantId },
      });

      if (
        tenantSettings?.captureMode === 'authorize_then_capture' &&
        (order.paymentStatus === 'authorized' ||
          order.paymentStatus === 'partially_captured')
      ) {
        let shipmentCents = 0;
        for (const itemDto of dto.items) {
          const orderItem = order.items?.find(
            (i) => i.id === itemDto.orderItemId,
          );
          if (orderItem) {
            shipmentCents += orderItem.unitPriceCents * itemDto.quantity;
          }
        }

        if (shipmentCents > 0) {
          await this.paymentsService.capturePayment(
            order.id,
            shipmentCents,
            manager,
          );

          const payRes = transitionPayment(
            order.paymentStatus,
            newFulfillmentStatus === 'fulfilled'
              ? 'CAPTURE'
              : 'PARTIAL_CAPTURE',
          );
          if (payRes.success) {
            order.paymentStatus = payRes.nextState;
          } else {
            order.paymentStatus =
              newFulfillmentStatus === 'fulfilled'
                ? 'paid'
                : 'partially_captured';
          }
        }
      }

      await manager.save(Order, order);

      const event = manager.create(OrderEvent, {
        tenantId,
        orderId: order.id,
        eventType: 'shipment_created',
        actorType: 'merchant_admin',
        actorId: actorId ?? undefined,
        metadata: {
          shipmentId: savedShipment.id,
          carrier: savedShipment.carrier,
          trackingNumber: savedShipment.trackingNumber,
          fulfillmentStatus: order.fulfillmentStatus,
        },
      });
      await manager.save(OrderEvent, event);

      return savedShipment;
    });
  }

  async cancelOrder(orderId: string, actorId?: string): Promise<Order> {
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

      if (order.status === 'cancelled') {
        throw new CodedBadRequestException(
          ErrorCode.ORDER_CANNOT_BE_CANCELLED,
          'Order is already cancelled',
        );
      }

      if (order.status === 'completed') {
        throw new CodedBadRequestException(
          ErrorCode.ORDER_CANNOT_BE_CANCELLED,
          'Completed orders cannot be cancelled',
        );
      }

      await this.cancelOrderSideEffects(
        manager,
        order,
        'merchant_admin',
        actorId,
      );

      order.status = 'cancelled';
      const savedOrder = await manager.save(Order, order);

      const tenantId = this.cls.get<string>('tenantId') || order.tenantId;

      const event = manager.create(OrderEvent, {
        tenantId,
        orderId: order.id,
        eventType: 'cancelled_by_admin',
        actorType: 'merchant_admin',
        actorId: actorId ?? undefined,
      });
      await manager.save(OrderEvent, event);

      return savedOrder;
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

    if (order.paymentStatus === 'authorized') {
      await this.paymentsService.voidPayment(order.id, manager);
      order.paymentStatus = 'voided';
    } else if (
      order.paymentStatus === 'captured' ||
      order.paymentStatus === 'paid' ||
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
