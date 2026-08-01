import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'crypto';
import { ClsService } from 'nestjs-cls';
import { OrdersService } from '../orders.service';
import { TenantDbService } from '../../db/tenant-db.service';
import { PaymentsService } from '../../payments/payments.service';
import { Order } from '../../db/entities/order.entity';
import { OrderItem } from '../../db/entities/order-item.entity';
import { OrderEvent } from '../../db/entities/order-event.entity';
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
      find: jest.fn(),
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
    it('should successfully transition pending_payment -> paid', async () => {
      const order = {
        id: mockOrderId,
        tenantId: mockTenantId,
        status: 'pending_payment',
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
      expect(savedEntities).toContainEqual(
        expect.objectContaining({
          id: mockOrderId,
          status: 'paid',
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
        items: [
          { variantId: 'var-1', quantity: 3 } as OrderItem,
        ],
      } as unknown as Order;

      em.findOne.mockImplementation((entityClass: any, opts: any) => {
        if (entityClass === Order) return Promise.resolve(order);
        if (entityClass === ProductVariant) return Promise.resolve(variant);
        return Promise.resolve(null);
      });

      await service.transitionStatus(mockOrderId, 'cancelled', 'admin');

      expect(order.status).toBe('cancelled');
      expect(variant.stock).toBe(13);
      expect(savedEntities).toContainEqual(variant);
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
        items: [
          { variantId: 'var-1', quantity: 2 } as OrderItem,
        ],
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
});
