/* eslint-disable @typescript-eslint/unbound-method */
import { CheckoutService } from '../checkout.service';
import { TenantDbService } from '../../db/tenant-db.service';
import { TenantSettingsService } from '../../tenant-settings/tenant-settings.service';
import { PaymentsService } from '../../payments/payments.service';
import { ClsService } from 'nestjs-cls';
import { CheckoutDto } from '../dto/checkout.dto';
import { ErrorCode } from '@tiny-threads/shared';
import {
  CodedBadRequestException,
  CodedForbiddenException,
} from '../../common/errors/coded-exceptions';

describe('CheckoutService', () => {
  let service: CheckoutService;
  let tenantDbService: jest.Mocked<TenantDbService>;
  let tenantSettingsService: jest.Mocked<TenantSettingsService>;
  let paymentsService: jest.Mocked<PaymentsService>;
  let clsService: jest.Mocked<ClsService>;

  beforeEach(() => {
    tenantDbService = {
      run: jest.fn(),
    } as unknown as jest.Mocked<TenantDbService>;

    tenantSettingsService = {
      getSettings: jest.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        allowGuestCheckout: true,
        platformFeePercent: 2.5,
      }),
    } as unknown as jest.Mocked<TenantSettingsService>;

    paymentsService = {
      processOrderPayment: jest.fn().mockResolvedValue({
        payment: { status: 'captured' },
      }),
    } as unknown as jest.Mocked<PaymentsService>;

    clsService = {
      get: jest.fn().mockReturnValue('tenant-1'),
    } as unknown as jest.Mocked<ClsService>;

    service = new CheckoutService(
      tenantDbService,
      tenantSettingsService,
      paymentsService,
      clsService,
    );
  });

  const dto: CheckoutDto = {
    cartId: 'cart-uuid-1',
    customerEmail: 'test@example.com',
    shippingAddress: { street: '123 Main St', city: 'City', country: 'US' },
    billingAddress: { street: '123 Main St', city: 'City', country: 'US' },
    paymentToken: 'mock_success',
  };

  it('1. should reject unauthenticated checkout when allow_guest_checkout = false (GUEST_CHECKOUT_DISABLED)', async () => {
    tenantSettingsService.getSettings.mockResolvedValueOnce({
      tenantId: 'tenant-1',
      allowGuestCheckout: false,
      platformFeePercent: 2.5,
    } as any);

    await expect(service.checkout(dto, undefined)).rejects.toThrow(
      CodedForbiddenException,
    );

    try {
      await service.checkout(dto, undefined);
    } catch (err: any) {
      expect(err.getResponse().code).toBe(ErrorCode.GUEST_CHECKOUT_DISABLED);
    }
  });

  it('2. should reject when cart is empty or converted (CART_EMPTY)', async () => {
    tenantDbService.run.mockImplementation(async (cb) => {
      const em = {
        findOne: jest.fn().mockResolvedValue(null), // Cart not found
      };
      return cb(em as any);
    });

    await expect(service.checkout(dto, 'customer-1')).rejects.toThrow(
      CodedBadRequestException,
    );

    try {
      await service.checkout(dto, 'customer-1');
    } catch (err: any) {
      expect(err.getResponse().code).toBe(ErrorCode.CART_EMPTY);
    }

    // Also test converted cart
    tenantDbService.run.mockImplementation(async (cb) => {
      const em = {
        findOne: jest.fn().mockResolvedValue({
          id: 'cart-uuid-1',
          status: 'converted',
          items: [{ variantId: 'v1', qty: 1 }],
        }),
      };
      return cb(em as any);
    });

    try {
      await service.checkout(dto, 'customer-1');
    } catch (err: any) {
      expect(err.getResponse().code).toBe(ErrorCode.CART_EMPTY);
    }
  });

  it('3. should reject when stock is insufficient (INSUFFICIENT_STOCK)', async () => {
    const mockCart = {
      id: 'cart-uuid-1',
      status: 'active',
      items: [{ variantId: 'variant-1', qty: 5 }],
    };

    const mockVariant = {
      id: 'variant-1',
      stock: 2, // Less than item.qty (5)
      priceCents: 1000,
      sku: 'SKU-1',
    };

    tenantDbService.run.mockImplementation(async (cb) => {
      const em = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(mockCart) // Cart lookup
          .mockResolvedValueOnce(mockVariant), // ProductVariant lookup
      };
      return cb(em as any);
    });

    await expect(service.checkout(dto, 'customer-1')).rejects.toThrow(
      CodedBadRequestException,
    );

    try {
      await service.checkout(dto, 'customer-1');
    } catch (err: any) {
      expect(err.getResponse().code).toBe(ErrorCode.INSUFFICIENT_STOCK);
    }
  });

  it('4. should successfully checkout with stock decrement, order & items creation, price snapshotting, payment capture, and cart status converted', async () => {
    const mockCart = {
      id: 'cart-uuid-1',
      tenantId: 'tenant-1',
      status: 'active',
      items: [{ variantId: 'variant-1', qty: 2 }],
    };

    const mockVariant = {
      id: 'variant-1',
      productId: 'product-1',
      stock: 10,
      priceCents: 1500,
      sku: 'TEST-SKU-1',
      product: { title: 'Test Product' },
    };

    const savedEntities: any[] = [];

    tenantDbService.run.mockImplementation(async (cb) => {
      const em = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(mockCart)
          .mockResolvedValueOnce(mockVariant),
        create: jest.fn().mockImplementation((entityClass, data) => {
          return { ...data, id: `${entityClass.name.toLowerCase()}-id` };
        }),
        save: jest.fn().mockImplementation((entityClassOrObject, obj) => {
          const entity = obj || entityClassOrObject;
          savedEntities.push(entity);
          return Promise.resolve(entity);
        }),
      };
      return cb(em as any);
    });

    const result = await service.checkout(dto, undefined);

    // Verify raw guest token returned for guest checkout
    expect(result.guestAccessToken).toBeDefined();
    expect(typeof result.guestAccessToken).toBe('string');
    expect(result.order).toBeDefined();

    // Verify stock decrement
    expect(mockVariant.stock).toBe(8);

    // Verify cart status converted
    expect(mockCart.status).toBe('converted');

    // Verify payment processing called
    expect(paymentsService.processOrderPayment).toHaveBeenCalledTimes(1);

    // Verify order and item details saved
    const savedOrder = savedEntities.find(
      (e) => e.customerEmail === 'test@example.com',
    );
    expect(savedOrder).toBeDefined();
    expect(savedOrder.totalCents).toBe(3000); // 1500 * 2
    expect(savedOrder.status).toBe('paid');
    expect(savedOrder.paymentStatus).toBe('captured');

    const savedOrderItems = savedEntities.find(
      (e) => Array.isArray(e) && e[0]?.unitPriceCents === 1500,
    );
    expect(savedOrderItems).toBeDefined();
    expect(savedOrderItems[0].totalPriceCents).toBe(3000);
    expect(savedOrderItems[0].productName).toBe('Test Product');
    expect(savedOrderItems[0].sku).toBe('TEST-SKU-1');
  });

  it('5. should open exactly one tenantDb.run per checkout call and fetch tenant settings exactly once, never nested (R3)', async () => {
    const mockCart = {
      id: 'cart-uuid-1',
      tenantId: 'tenant-1',
      status: 'active',
      items: [{ variantId: 'variant-1', qty: 1 }],
    };

    const mockVariant = {
      id: 'variant-1',
      productId: 'product-1',
      stock: 10,
      priceCents: 1000,
      sku: 'SKU-1',
      product: { title: 'Product' },
    };

    tenantDbService.run.mockImplementation(async (cb) => {
      const em = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(mockCart)
          .mockResolvedValueOnce(mockVariant),
        create: jest.fn().mockImplementation((_, data: any) => data),
        save: jest
          .fn()
          .mockImplementation((entityClassOrObject: any, obj: any) =>
            Promise.resolve(obj ?? entityClassOrObject),
          ),
      };
      return cb(em as any);
    });

    // Guest checkout exercises both the pre-refactor call sites (guest-check
    // + inside-transaction re-fetch), so it's the scenario that actually
    // distinguishes the nested-transaction bug from the fix.
    await service.checkout(dto, undefined);

    const runSpy = tenantDbService.run;
    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(tenantSettingsService.getSettings).toHaveBeenCalledTimes(1);
  });
});
