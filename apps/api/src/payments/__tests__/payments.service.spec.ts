/* eslint-disable @typescript-eslint/unbound-method */
import { PaymentsService } from '../payments.service';
import { MockPaymentProvider } from '../providers/mock-payment.provider';
import { TenantDbService } from '../../db/tenant-db.service';
import { ClsService } from 'nestjs-cls';
import { Order } from '../../db/entities/order.entity';
import { Payment } from '../../db/entities/payment.entity';
import { Refund } from '../../db/entities/refund.entity';
import {
  CodedBadRequestException,
  CodedNotFoundException,
} from '../../common/errors/coded-exceptions';
import { ErrorCode } from '@tiny-threads/shared';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let provider: MockPaymentProvider;
  let tenantDbService: jest.Mocked<TenantDbService>;
  let clsService: jest.Mocked<ClsService>;

  beforeEach(() => {
    provider = new MockPaymentProvider();
    tenantDbService = {
      run: jest.fn(),
    } as unknown as jest.Mocked<TenantDbService>;
    clsService = {
      get: jest.fn().mockReturnValue('tenant-123'),
    } as unknown as jest.Mocked<ClsService>;

    service = new PaymentsService(provider, tenantDbService, clsService);
  });

  describe('processOrderPayment', () => {
    const dummyOrder: Order = {
      id: 'order-1',
      tenantId: 'tenant-123',
      customerEmail: 'customer@example.com',
      status: 'pending_payment',
      paymentStatus: 'pending',
      currencyCode: 'USD',
      totalCents: 10000,
      shippingAddress: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Order;

    it('should process payment successfully with mock_success, saving captured Payment and Settlement', async () => {
      const savedEntities: any[] = [];
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          create: jest.fn().mockImplementation((entityClass, data) => ({
            id: `${entityClass.name.toLowerCase()}-id`,
            ...data,
          })),
          save: jest.fn().mockImplementation((entityClass, data) => {
            const obj = data || entityClass;
            savedEntities.push(obj);
            return Promise.resolve(obj);
          }),
        };
        return cb(em as any);
      });

      const result = await service.processOrderPayment(
        dummyOrder,
        'mock_success',
        10,
      );

      expect(result.payment).toBeDefined();
      expect(result.payment.status).toBe('captured');
      expect(result.payment.amountCents).toBe(10000);
      expect(result.payment.providerTransactionId).toMatch(/^mock_tx_/);

      expect(result.settlement).toBeDefined();
      expect(result.settlement?.grossAmountCents).toBe(10000);
      expect(result.settlement?.platformFeeCents).toBe(1000);
      expect(result.settlement?.merchantNetAmountCents).toBe(9000);
      expect(result.settlement?.status).toBe('settled');
    });

    it('should handle mock_decline by saving failed Payment and throwing PAYMENT_FAILED', async () => {
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          create: jest.fn().mockImplementation((entityClass, data) => ({
            id: `${entityClass.name.toLowerCase()}-id`,
            ...data,
          })),
          save: jest.fn().mockImplementation((entityClass, data) => {
            const obj = data || entityClass;
            return Promise.resolve(obj);
          }),
        };
        return cb(em as any);
      });

      await expect(
        service.processOrderPayment(dummyOrder, 'mock_decline', 10),
      ).rejects.toThrow(CodedBadRequestException);

      try {
        await service.processOrderPayment(dummyOrder, 'mock_decline', 10);
      } catch (err: any) {
        expect(err.getResponse().code).toBe(ErrorCode.PAYMENT_FAILED);
      }
    });

    it('should throw CodedBadRequestException if platformFeePercent is negative or > 100', async () => {
      await expect(
        service.processOrderPayment(dummyOrder, 'token', -5),
      ).rejects.toThrow(CodedBadRequestException);

      await expect(
        service.processOrderPayment(dummyOrder, 'token', 150),
      ).rejects.toThrow(CodedBadRequestException);
    });

    it('should use provided EntityManager when passed', async () => {
      const mockEm = {
        create: jest.fn().mockImplementation((entityClass, data) => ({
          id: `${entityClass.name.toLowerCase()}-id`,
          ...data,
        })),
        save: jest.fn().mockImplementation((entityClass, data) => {
          const obj = data || entityClass;
          return Promise.resolve(obj);
        }),
      } as any;

      const result = await service.processOrderPayment(
        dummyOrder,
        'mock_success',
        10,
        mockEm,
      );

      expect(result.payment.status).toBe('captured');
      expect(tenantDbService.run).not.toHaveBeenCalled();
      expect(mockEm.save).toHaveBeenCalled();
    });
  });

  describe('refundPayment', () => {
    const existingPayment: Payment = {
      id: 'payment-1',
      tenantId: 'tenant-123',
      orderId: 'order-1',
      provider: 'mock',
      providerTransactionId: 'mock_tx_123',
      status: 'captured',
      amountCents: 10000,
      currencyCode: 'USD',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Payment;

    it('should throw ORDER_NOT_FOUND if no captured payment is found', async () => {
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest.fn().mockResolvedValue(null),
        };
        return cb(em as any);
      });

      await expect(service.refundPayment('order-1', 3000)).rejects.toThrow(
        CodedNotFoundException,
      );
    });

    it('should throw REFUND_EXCEEDS_PAYMENT if refund sum exceeds payment amount', async () => {
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest.fn().mockResolvedValue(existingPayment),
          find: jest.fn().mockResolvedValue([{ amountCents: 8000 } as Refund]),
        };
        return cb(em as any);
      });

      await expect(service.refundPayment('order-1', 3000)).rejects.toThrow(
        CodedBadRequestException,
      );

      try {
        await service.refundPayment('order-1', 3000);
      } catch (err: any) {
        expect(err.getResponse().code).toBe(ErrorCode.REFUND_EXCEEDS_PAYMENT);
      }
    });

    it('should execute refund and save Refund entity when valid', async () => {
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest.fn().mockResolvedValue(existingPayment),
          find: jest.fn().mockResolvedValue([{ amountCents: 2000 } as Refund]),
          create: jest.fn().mockImplementation((_, data) => ({
            id: 'refund-id',
            ...data,
          })),
          save: jest.fn().mockImplementation((_, data) => {
            return Promise.resolve(data);
          }),
        };
        return cb(em as any);
      });

      const result = await service.refundPayment(
        'order-1',
        3000,
        'Customer return',
      );

      expect(result).toBeDefined();
      expect(result.amountCents).toBe(3000);
      expect(result.status).toBe('completed');
      expect(result.reason).toBe('Customer return');
      expect(result.providerRefundId).toMatch(/^mock_ref_/);
    });
  });
});
