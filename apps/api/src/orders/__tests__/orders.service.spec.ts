import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'crypto';
import { ClsService } from 'nestjs-cls';
import { OrdersService } from '../orders.service';
import { TenantDbService } from '../../db/tenant-db.service';
import { PaymentsService } from '../../payments/payments.service';
import { Order } from '../../db/entities/order.entity';
import { OrderItem } from '../../db/entities/order-item.entity';
import { ProductVariant } from '../../db/entities/product-variants.entity';
import { Refund } from '../../db/entities/refund.entity';
import {
  CodedBadRequestException,
  CodedNotFoundException,
} from '../../common/errors/coded-exceptions';
import { ErrorCode } from '@tiny-threads/shared';

describe('OrdersService', () => {
  let service: OrdersService;
  let tenantDb: { run: jest.Mock };
  let paymentsService: { refundPayment: jest.Mock };
  let clsService: { get: jest.Mock };

  beforeEach(async () => {
    tenantDb = {
      run: jest.fn((cb) => cb(em)),
    };
    paymentsService = {
      refundPayment: jest.fn(),
    };
    clsService = {
      get: jest.fn().mockReturnValue('tenant-123'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: TenantDbService, useValue: tenantDb },
        { provide: PaymentsService, useValue: paymentsService },
        { provide: ClsService, useValue: clsService },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  const mockTenantId = 'tenant-123';
  const mockOrderId = 'order-123';
  const mockCustomerId = 'customer-123';

  let savedEntities: any[];
  let em: any;

  beforeEach(() => {
    savedEntities = [];
    em = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      save: jest.fn((entityOrClass: any, entity?: any) => {
        const target = entity ?? entityOrClass;
        savedEntities.push(target);
        return Promise.resolve(target);
      }),
      create: jest.fn((entityClass: any, dto: any) => ({
        id: 'generated-id',
        ...dto,
      })),
    };
  });

  describe('transitionStatus', () => {
    it('should successfully transition pending_payment -> paid and clear expiresAt', async () => {
      const order = {
        id: mockOrderId,
        tenantId: mockTenantId,
        status: 'pending_payment',
        expiresAt: new Date(Date.now() + 1800000),
        items: [],
      } as unknown as Order;

      em.findOne.mockImplementation((entityClass: any) => {
        if (entityClass === Order) return Promise.resolve(order);
        return Promise.resolve(null);
      });

      const updated = await service.transitionStatus(
        mockOrderId,
        'paid',
        'system',
      );

      expect(updated.status).toBe('paid');
      expect(updated.expiresAt).toBeNull();
      expect(savedEntities).toContainEqual(
        expect.objectContaining({
          id: mockOrderId,
          status: 'paid',
          expiresAt: null,
        }),
      );
      expect(savedEntities).toContainEqual(
        expect.objectContaining({
          eventType: 'status_changed_to_paid',
          actorType: 'system',
        }),
      );
    });

    it('should transition through full valid lifecycle: pending_payment -> paid -> processing -> shipped -> delivered', async () => {
      const order = {
        id: mockOrderId,
        tenantId: mockTenantId,
        status: 'pending_payment',
        items: [],
      } as unknown as Order;

      em.findOne.mockImplementation(() => Promise.resolve(order));

      await service.transitionStatus(mockOrderId, 'paid', 'admin');
      expect(order.status).toBe('paid');

      await service.transitionStatus(mockOrderId, 'processing', 'admin');
      expect(order.status).toBe('processing');

      await service.transitionStatus(mockOrderId, 'shipped', 'admin');
      expect(order.status).toBe('shipped');

      await service.transitionStatus(mockOrderId, 'delivered', 'admin');
      expect(order.status).toBe('delivered');
    });

    it('should throw INVALID_ORDER_STATUS_TRANSITION on invalid transition (e.g. pending_payment -> delivered)', async () => {
      const order = {
        id: mockOrderId,
        tenantId: mockTenantId,
        status: 'pending_payment',
        items: [],
      } as unknown as Order;

      em.findOne.mockImplementation(() => Promise.resolve(order));

      await expect(
        service.transitionStatus(mockOrderId, 'delivered', 'admin'),
      ).rejects.toThrow(CodedBadRequestException);

      try {
        await service.transitionStatus(mockOrderId, 'delivered', 'admin');
      } catch (err: any) {
        expect(err.getResponse().code).toBe(
          ErrorCode.INVALID_ORDER_STATUS_TRANSITION,
        );
      }
    });

    it('should restore variant stock when order status transitions to cancelled', async () => {
      const variant = { id: 'var-1', stock: 10 } as ProductVariant;
      const order = {
        id: mockOrderId,
        tenantId: mockTenantId,
        status: 'processing',
        items: [{ variantId: 'var-1', quantity: 3 } as OrderItem],
      } as unknown as Order;

      em.findOne.mockImplementation((entityClass: any) => {
        if (entityClass === Order) return Promise.resolve(order);
        if (entityClass === ProductVariant) return Promise.resolve(variant);
        return Promise.resolve(null);
      });

      await service.transitionStatus(mockOrderId, 'cancelled', 'admin');

      expect(order.status).toBe('cancelled');
      expect(variant.stock).toBe(13);
      expect(savedEntities).toContainEqual(variant);
    });

    it('should automatically refund captured payment when cancelling a paid order', async () => {
      const variant = { id: 'var-1', stock: 10 } as ProductVariant;
      const mockOrder = {
        id: 'order-paid-1',
        tenantId: mockTenantId,
        status: 'processing',
        paymentStatus: 'captured',
        totalCents: 5000,
        items: [{ variantId: 'var-1', quantity: 3 } as OrderItem],
      } as unknown as Order;

      em.findOne.mockImplementation((entityClass: any) => {
        if (entityClass === Order) return Promise.resolve(mockOrder);
        if (entityClass === ProductVariant) return Promise.resolve(variant);
        return Promise.resolve(null);
      });

      const refundSpy = paymentsService.refundPayment;

      const result = await service.transitionStatus(
        'order-paid-1',
        'cancelled',
        'admin',
      );

      expect(refundSpy).toHaveBeenCalledWith(
        'order-paid-1',
        mockOrder.totalCents,
        'Order cancelled',
        expect.anything(),
      );
      expect(result.paymentStatus).toBe('refunded');
    });

    it('should propagate a refundPayment rejection and leave the order unsaved when auto-refunding a cancelled order fails', async () => {
      const variant = { id: 'var-1', stock: 10 } as ProductVariant;
      const mockOrder = {
        id: 'order-paid-2',
        tenantId: mockTenantId,
        status: 'processing',
        paymentStatus: 'captured',
        totalCents: 5000,
        items: [{ variantId: 'var-1', quantity: 3 } as OrderItem],
      } as unknown as Order;

      em.findOne.mockImplementation((entityClass: any) => {
        if (entityClass === Order) return Promise.resolve(mockOrder);
        if (entityClass === ProductVariant) return Promise.resolve(variant);
        return Promise.resolve(null);
      });

      const refundError = new CodedNotFoundException(
        ErrorCode.PAYMENT_NOT_FOUND,
        'No captured payment found',
      );
      paymentsService.refundPayment.mockRejectedValueOnce(refundError);

      await expect(
        service.transitionStatus('order-paid-2', 'cancelled', 'admin'),
      ).rejects.toThrow(refundError);

      // The order was never transitioned/saved as cancelled: the throw
      // happens before `order.status = newStatus` and before the
      // subsequent `manager.save(Order, ...)` call.
      expect(mockOrder.status).toBe('processing');
      expect(mockOrder.paymentStatus).toBe('captured');
      const orderSaveCalls = em.save.mock.calls.filter(
        ([entityClass]: any[]) => entityClass === Order,
      );
      expect(orderSaveCalls).toHaveLength(0);
    });

    it('should not refund when cancelling an order whose payment was never captured', async () => {
      const order = {
        id: mockOrderId,
        tenantId: mockTenantId,
        status: 'pending_payment',
        paymentStatus: 'pending',
        totalCents: 5000,
        items: [],
      } as unknown as Order;

      em.findOne.mockImplementation((entityClass: any) => {
        if (entityClass === Order) return Promise.resolve(order);
        return Promise.resolve(null);
      });

      const result = await service.transitionStatus(
        mockOrderId,
        'cancelled',
        'admin',
      );

      expect(paymentsService.refundPayment).not.toHaveBeenCalled();
      expect(result.paymentStatus).toBe('pending');
    });

    it('should refund only the remaining balance when cancelling a partially-refunded order', async () => {
      const variant = { id: 'var-1', stock: 10 } as ProductVariant;
      const mockOrder = {
        id: 'order-partial-1',
        tenantId: mockTenantId,
        status: 'processing',
        paymentStatus: 'partially_refunded',
        totalCents: 5000,
        items: [{ variantId: 'var-1', quantity: 3 } as OrderItem],
      } as unknown as Order;

      em.findOne.mockImplementation((entityClass: any) => {
        if (entityClass === Order) return Promise.resolve(mockOrder);
        if (entityClass === ProductVariant) return Promise.resolve(variant);
        return Promise.resolve(null);
      });
      // 2000 of the 5000 total was already refunded manually.
      em.find.mockResolvedValue([{ amountCents: 2000 } as Refund]);

      const result = await service.transitionStatus(
        'order-partial-1',
        'cancelled',
        'admin',
      );

      expect(paymentsService.refundPayment).toHaveBeenCalledWith(
        'order-partial-1',
        3000,
        'Order cancelled',
        expect.anything(),
      );
      expect(result.paymentStatus).toBe('refunded');
    });

    it('should lock variants pessimistically and restore stock in variantId order regardless of item order', async () => {
      const variantB = { id: 'var-b', stock: 10 };
      const variantA = { id: 'var-a', stock: 20 };
      const order = {
        id: mockOrderId,
        tenantId: mockTenantId,
        status: 'processing',
        items: [
          { variantId: 'var-b', quantity: 1 } as OrderItem,
          { variantId: 'var-a', quantity: 2 } as OrderItem,
        ],
      } as unknown as Order;

      em.findOne.mockImplementation((entityClass: any, opts: any) => {
        if (entityClass === Order) return Promise.resolve(order);
        if (entityClass === ProductVariant) {
          if (opts.where.id === 'var-a') return Promise.resolve(variantA);
          if (opts.where.id === 'var-b') return Promise.resolve(variantB);
        }
        return Promise.resolve(null);
      });

      await service.transitionStatus(mockOrderId, 'cancelled', 'admin');

      const variantFindCalls = em.findOne.mock.calls.filter(
        ([entityClass]: any[]) => entityClass === ProductVariant,
      );

      // Locked, and processed in variantId order (var-a before var-b),
      // not the order items appear in on the order.
      expect(variantFindCalls).toEqual([
        [
          ProductVariant,
          expect.objectContaining({
            where: { id: 'var-a' },
            lock: { mode: 'pessimistic_write' },
          }),
        ],
        [
          ProductVariant,
          expect.objectContaining({
            where: { id: 'var-b' },
            lock: { mode: 'pessimistic_write' },
          }),
        ],
      ]);
      expect(variantA.stock).toBe(22);
      expect(variantB.stock).toBe(11);
    });
  });

  describe('customerCancelOrder', () => {
    it('should allow customer to cancel pending_payment order and restore stock', async () => {
      const variant = { id: 'var-1', stock: 5 } as ProductVariant;
      const order = {
        id: mockOrderId,
        customerId: mockCustomerId,
        tenantId: mockTenantId,
        status: 'pending_payment',
        items: [{ variantId: 'var-1', quantity: 2 } as OrderItem],
      } as unknown as Order;

      em.findOne.mockImplementation((entityClass: any) => {
        if (entityClass === Order) return Promise.resolve(order);
        if (entityClass === ProductVariant) return Promise.resolve(variant);
        return Promise.resolve(null);
      });

      const result = await service.customerCancelOrder(
        mockCustomerId,
        mockOrderId,
      );

      expect(result.status).toBe('cancelled');
      expect(variant.stock).toBe(7);
      expect(savedEntities).toContainEqual(
        expect.objectContaining({
          eventType: 'cancelled_by_customer',
          actorType: 'customer',
          actorId: mockCustomerId,
        }),
      );
    });

    it('should throw ORDER_CANNOT_BE_CANCELLED if customer tries to cancel a paid order', async () => {
      const order = {
        id: mockOrderId,
        customerId: mockCustomerId,
        tenantId: mockTenantId,
        status: 'paid',
        items: [],
      } as unknown as Order;

      em.findOne.mockImplementation(() => Promise.resolve(order));

      await expect(
        service.customerCancelOrder(mockCustomerId, mockOrderId),
      ).rejects.toThrow(CodedBadRequestException);

      try {
        await service.customerCancelOrder(mockCustomerId, mockOrderId);
      } catch (err: any) {
        expect(err.getResponse().code).toBe(
          ErrorCode.ORDER_CANNOT_BE_CANCELLED,
        );
      }
    });

    it('should throw ORDER_NOT_FOUND if order does not exist or does not belong to customer', async () => {
      em.findOne.mockImplementation(() => Promise.resolve(null));

      await expect(
        service.customerCancelOrder(mockCustomerId, mockOrderId),
      ).rejects.toThrow(CodedNotFoundException);
    });
  });

  describe('getGuestOrder', () => {
    it('should return guest order when provided valid guest token', async () => {
      const rawToken = 'secret-guest-token';
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');

      const order = {
        id: mockOrderId,
        guestAccessTokenHash: tokenHash,
        items: [],
      } as unknown as Order;

      em.findOne.mockImplementation(() => Promise.resolve(order));

      const result = await service.getGuestOrder(mockOrderId, rawToken);
      expect(result).toBe(order);
    });

    it('should throw ORDER_NOT_FOUND when provided invalid token', async () => {
      const rawToken = 'secret-guest-token';
      const wrongToken = 'wrong-token';
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');

      const order = {
        id: mockOrderId,
        guestAccessTokenHash: tokenHash,
        items: [],
      } as unknown as Order;

      em.findOne.mockImplementation(() => Promise.resolve(order));

      await expect(
        service.getGuestOrder(mockOrderId, wrongToken),
      ).rejects.toThrow(CodedNotFoundException);
    });

    it('should correctly verify guest order token using timing-safe comparison', async () => {
      const rawToken = 'raw_valid_token';
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');

      const order = {
        id: 'order-guest-1',
        guestAccessTokenHash: tokenHash,
        items: [],
      } as unknown as Order;

      em.findOne.mockImplementation(() => Promise.resolve(order));

      const valid = await service.getGuestOrder(
        'order-guest-1',
        'raw_valid_token',
      );
      expect(valid.id).toBe('order-guest-1');

      await expect(
        service.getGuestOrder('order-guest-1', 'invalid_token'),
      ).rejects.toThrow(CodedNotFoundException);
    });

    it('should safely handle token hash length mismatch without throwing RangeError', async () => {
      const rawToken = 'raw_valid_token';

      const order = {
        id: 'order-guest-2',
        guestAccessTokenHash: 'ff', // Different length hash
        items: [],
      } as unknown as Order;

      em.findOne.mockImplementation(() => Promise.resolve(order));

      await expect(
        service.getGuestOrder('order-guest-2', rawToken),
      ).rejects.toThrow(CodedNotFoundException);
    });
  });

  describe('refundOrder', () => {
    it('should process partial refund and set paymentStatus to partially_refunded', async () => {
      const order = {
        id: mockOrderId,
        tenantId: mockTenantId,
        totalCents: 10000,
        paymentStatus: 'paid',
      } as unknown as Order;

      const mockRefund = {
        id: 'refund-1',
        amountCents: 4000,
      } as Refund;

      em.findOne.mockImplementation(() => Promise.resolve(order));
      paymentsService.refundPayment.mockResolvedValue(mockRefund);
      em.find.mockResolvedValue([mockRefund]);

      const refund = await service.refundOrder(mockOrderId, {
        amountCents: 4000,
        reason: 'Customer request',
      });

      expect(refund).toBe(mockRefund);
      expect(order.paymentStatus).toBe('partially_refunded');
      expect(savedEntities).toContainEqual(
        expect.objectContaining({
          eventType: 'refunded',
          actorType: 'admin',
        }),
      );
    });

    it('should process full refund and set paymentStatus to refunded', async () => {
      const order = {
        id: mockOrderId,
        tenantId: mockTenantId,
        totalCents: 10000,
        paymentStatus: 'paid',
      } as unknown as Order;

      const mockRefund = {
        id: 'refund-1',
        amountCents: 10000,
      } as Refund;

      em.findOne.mockImplementation(() => Promise.resolve(order));
      paymentsService.refundPayment.mockResolvedValue(mockRefund);
      em.find.mockResolvedValue([mockRefund]);

      await service.refundOrder(mockOrderId, {
        amountCents: 10000,
      });

      expect(order.paymentStatus).toBe('refunded');
    });
  });

  describe('getCustomerOrders', () => {
    it('should return paginated list of customer orders', async () => {
      const orders = [{ id: 'order-1', customerId: mockCustomerId }] as Order[];
      em.findAndCount.mockResolvedValue([orders, 1]);

      const result = await service.getCustomerOrders(mockCustomerId, {
        page: 1,
        limit: 10,
      });

      expect(result).toEqual({
        items: orders,
        total: 1,
        page: 1,
        limit: 10,
      });
      expect(em.findAndCount).toHaveBeenCalledWith(
        Order,
        expect.objectContaining({
          where: { customerId: mockCustomerId },
          skip: 0,
          take: 10,
        }),
      );
    });

    it('should filter customer orders by status when provided', async () => {
      em.findAndCount.mockResolvedValue([[], 0]);

      await service.getCustomerOrders(mockCustomerId, {
        page: 2,
        limit: 5,
        status: 'shipped',
      });

      expect(em.findAndCount).toHaveBeenCalledWith(
        Order,
        expect.objectContaining({
          where: { customerId: mockCustomerId, status: 'shipped' },
          skip: 5,
          take: 5,
        }),
      );
    });
  });

  describe('getMerchantOrders', () => {
    it('should return paginated list of merchant orders', async () => {
      const orders = [{ id: 'order-1' }] as Order[];
      em.findAndCount.mockResolvedValue([orders, 1]);

      const result = await service.getMerchantOrders({
        page: 1,
        limit: 20,
      });

      expect(result).toEqual({
        items: orders,
        total: 1,
        page: 1,
        limit: 20,
      });
    });

    it('should filter merchant orders by status when provided', async () => {
      em.findAndCount.mockResolvedValue([[], 0]);

      await service.getMerchantOrders({
        page: 1,
        limit: 20,
        status: 'delivered',
      });

      expect(em.findAndCount).toHaveBeenCalledWith(
        Order,
        expect.objectContaining({
          where: { status: 'delivered' },
        }),
      );
    });
  });

  describe('createShipment', () => {
    it('should create shipment, shipment items, update fulfillmentStatus and transition status', async () => {
      const orderItem = {
        id: 'item-1',
        quantity: 2,
        unitPriceCents: 1000,
      } as OrderItem;
      const order = {
        id: mockOrderId,
        tenantId: mockTenantId,
        status: 'confirmed',
        fulfillmentStatus: 'unfulfilled',
        paymentStatus: 'paid',
        items: [orderItem],
      } as unknown as Order;

      em.findOne.mockImplementation((entityClass: any) => {
        if (entityClass === Order) return Promise.resolve(order);
        return Promise.resolve(null);
      });
      em.find.mockResolvedValue([]);

      const dto = {
        carrier: 'DHL',
        trackingNumber: '12345',
        items: [{ orderItemId: 'item-1', quantity: 2 }],
      };

      const shipment = await service.createShipment(
        mockOrderId,
        dto,
        'admin-1',
      );

      expect(shipment.carrier).toBe('DHL');
      expect(order.fulfillmentStatus).toBe('fulfilled');
      expect(order.status).toBe('completed');
    });

    it('should throw CodedNotFoundException if order does not exist', async () => {
      em.findOne.mockResolvedValue(null);

      await expect(
        service.createShipment(mockOrderId, {
          carrier: 'FedEx',
          items: [{ orderItemId: 'item-1', quantity: 1 }],
        }),
      ).rejects.toThrow(CodedNotFoundException);
    });

    it('should throw CodedBadRequestException if quantity exceeds ordered amount', async () => {
      const orderItem = { id: 'item-1', quantity: 2 } as OrderItem;
      const order = {
        id: mockOrderId,
        tenantId: mockTenantId,
        status: 'confirmed',
        items: [orderItem],
      } as unknown as Order;

      em.findOne.mockResolvedValue(order);
      em.find.mockResolvedValue([]);

      await expect(
        service.createShipment(mockOrderId, {
          carrier: 'FedEx',
          items: [{ orderItemId: 'item-1', quantity: 3 }],
        }),
      ).rejects.toThrow(CodedBadRequestException);
    });
  });

  describe('cancelOrder', () => {
    it('should cancel order via merchant admin, restore stock, and refund payment', async () => {
      const variant = { id: 'var-1', stock: 5 } as ProductVariant;
      const order = {
        id: mockOrderId,
        tenantId: mockTenantId,
        status: 'confirmed',
        paymentStatus: 'paid',
        totalCents: 2000,
        items: [{ variantId: 'var-1', quantity: 2 } as OrderItem],
      } as unknown as Order;

      em.findOne.mockImplementation((entityClass: any) => {
        if (entityClass === Order) return Promise.resolve(order);
        if (entityClass === ProductVariant) return Promise.resolve(variant);
        return Promise.resolve(null);
      });

      const result = await service.cancelOrder(mockOrderId, 'admin-1');

      expect(result.status).toBe('cancelled');
      expect(variant.stock).toBe(7);
      expect(paymentsService.refundPayment).toHaveBeenCalled();
    });

    it('should throw CodedBadRequestException if order is already cancelled', async () => {
      const order = {
        id: mockOrderId,
        status: 'cancelled',
      } as unknown as Order;

      em.findOne.mockResolvedValue(order);

      await expect(service.cancelOrder(mockOrderId, 'admin-1')).rejects.toThrow(
        CodedBadRequestException,
      );
    });
  });
});
