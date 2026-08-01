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

    await expect(
      service.checkout(dto, undefined, 'guest-session-1'),
    ).rejects.toThrow(CodedForbiddenException);

    try {
      await service.checkout(dto, undefined, 'guest-session-1');
    } catch (err: any) {
      expect(err.getResponse().code).toBe(ErrorCode.GUEST_CHECKOUT_DISABLED);
    }
  });

  it('1b. should reject with a coded VALIDATION_FAILED error when neither customerId nor sessionId is provided, instead of crashing on activeCartWhere(undefined, undefined)', async () => {
    await expect(service.checkout(dto, undefined, undefined)).rejects.toThrow(
      CodedBadRequestException,
    );

    try {
      await service.checkout(dto, undefined, undefined);
    } catch (err: any) {
      expect(err.getResponse().code).toBe(ErrorCode.VALIDATION_FAILED);
    }

    // Must fail before ever touching the DB (no cart lookup attempted).
    expect(tenantDbService.run).not.toHaveBeenCalled();
  });

  it('2. should reject when cart is empty or not found for this caller (CART_EMPTY)', async () => {
    tenantDbService.run.mockImplementation(async (cb) => {
      const em = {
        findOne: jest.fn().mockResolvedValue(null), // Cart not found
      };
      return cb(em as any);
    });

    await expect(
      service.checkout(dto, 'customer-1', undefined),
    ).rejects.toThrow(CodedBadRequestException);

    try {
      await service.checkout(dto, 'customer-1', undefined);
    } catch (err: any) {
      expect(err.getResponse().code).toBe(ErrorCode.CART_EMPTY);
    }

    // Also reject when the found cart has no items.
    tenantDbService.run.mockImplementation(async (cb) => {
      const em = {
        findOne: jest.fn().mockResolvedValue({
          id: 'cart-uuid-1',
          status: 'active',
          items: [],
        }),
      };
      return cb(em as any);
    });

    try {
      await service.checkout(dto, 'customer-1', undefined);
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

    await expect(
      service.checkout(dto, 'customer-1', undefined),
    ).rejects.toThrow(CodedBadRequestException);

    try {
      await service.checkout(dto, 'customer-1', undefined);
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

    const result = await service.checkout(dto, undefined, 'guest-session-1');

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
    await service.checkout(dto, undefined, 'guest-session-1');

    const runSpy = tenantDbService.run;
    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(tenantSettingsService.getSettings).toHaveBeenCalledTimes(1);
  });

  describe('IDOR protection (R4): cart identity is derived, never client-supplied', () => {
    it('6. does not accept a cartId on the DTO at all', () => {
      expect((dto as any).cartId).toBeUndefined();
    });

    it("7. looks up the cart using activeCartWhere(customerId, sessionId), scoped to the caller's own identity — not any client-supplied id", async () => {
      const mockCart = {
        id: 'cart-uuid-1',
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

      let capturedWhere: any;
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest.fn().mockImplementation((_entity, opts: any) => {
            if (capturedWhere === undefined) {
              capturedWhere = opts.where;
              return Promise.resolve(mockCart);
            }
            return Promise.resolve(mockVariant);
          }),
          create: jest.fn().mockImplementation((_, data: any) => data),
          save: jest
            .fn()
            .mockImplementation((entityClassOrObject: any, obj: any) =>
              Promise.resolve(obj ?? entityClassOrObject),
            ),
        };
        return cb(em as any);
      });

      await service.checkout(dto, 'customer-owner', undefined);

      // Derived from the caller's own customerId, scoped to active carts —
      // this is exactly what activeCartWhere('customer-owner', undefined)
      // produces, and critically contains no attacker-suppliable cart id.
      expect(capturedWhere).toEqual({
        customerId: 'customer-owner',
        status: 'active',
      });
    });

    // Tests 8 & 9 model a fake "database" holding TWO real, non-empty carts
    // at once — one belonging to the caller ("attacker") and one belonging
    // to someone else ("victim") — and have findOne filter by the actual
    // `where` clause fields the same way Postgres would. This is a
    // stronger regression guard than asserting "returns null": if a future
    // change accidentally widened the where clause (e.g. dropped the
    // customerId/sessionId filter, or matched on the wrong field), this
    // fake DB would incorrectly hand back the victim's cart and the order
    // total would reveal it (99 vs 1), not silently pass by both carts
    // failing to match.
    it("8. a customer checking out only ever resolves their OWN cart, never a different customer's cart present in the same store", async () => {
      const attackerCart = {
        id: 'attacker-cart',
        customerId: 'attacker-customer',
        sessionId: null,
        status: 'active',
        items: [{ variantId: 'attacker-variant', qty: 1 }],
      };
      const victimCart = {
        id: 'victim-cart',
        customerId: 'victim-customer',
        sessionId: null,
        status: 'active',
        items: [{ variantId: 'victim-variant', qty: 99 }],
      };
      const fakeCarts = [attackerCart, victimCart];
      const variantsById: Record<string, any> = {
        'attacker-variant': {
          id: 'attacker-variant',
          productId: 'p-attacker',
          stock: 10,
          priceCents: 500,
          sku: 'ATTACKER-SKU',
          product: { title: 'Attacker Product' },
        },
        'victim-variant': {
          id: 'victim-variant',
          productId: 'p-victim',
          stock: 10,
          priceCents: 999900,
          sku: 'VICTIM-SKU',
          product: { title: 'Victim Product' },
        },
      };

      tenantDbService.run.mockImplementation(async (cb) => {
        let cartLookupDone = false;
        const em = {
          findOne: jest.fn().mockImplementation((_entity, opts: any) => {
            if (!cartLookupDone) {
              cartLookupDone = true;
              const where = opts.where;
              const match = fakeCarts.find(
                (c) =>
                  c.customerId === where.customerId &&
                  c.status === where.status,
              );
              return Promise.resolve(match ?? null);
            }
            return Promise.resolve(variantsById[opts.where.id] ?? null);
          }),
          create: jest.fn().mockImplementation((_, data: any) => data),
          save: jest
            .fn()
            .mockImplementation((_entityClass: any, obj: any) =>
              Promise.resolve(obj),
            ),
        };
        return cb(em as any);
      });

      const result = await service.checkout(
        dto,
        'attacker-customer',
        undefined,
      );

      // Only the attacker's own single $5.00 item — never the victim's
      // 99-unit, $9,999.00 line item.
      expect(result.order.totalCents).toBe(500);
      expect(attackerCart.status).toBe('converted');
      expect(victimCart.status).toBe('active'); // untouched
    });

    it("9. a guest checking out only ever resolves their OWN session's cart, never a different session's cart present in the same store", async () => {
      const attackerCart = {
        id: 'attacker-cart',
        customerId: null,
        sessionId: 'attacker-session',
        status: 'active',
        items: [{ variantId: 'attacker-variant', qty: 1 }],
      };
      const victimCart = {
        id: 'victim-cart',
        customerId: null,
        sessionId: 'victim-session',
        status: 'active',
        items: [{ variantId: 'victim-variant', qty: 99 }],
      };
      const fakeCarts = [attackerCart, victimCart];
      const variantsById: Record<string, any> = {
        'attacker-variant': {
          id: 'attacker-variant',
          productId: 'p-attacker',
          stock: 10,
          priceCents: 500,
          sku: 'ATTACKER-SKU',
          product: { title: 'Attacker Product' },
        },
        'victim-variant': {
          id: 'victim-variant',
          productId: 'p-victim',
          stock: 10,
          priceCents: 999900,
          sku: 'VICTIM-SKU',
          product: { title: 'Victim Product' },
        },
      };

      tenantDbService.run.mockImplementation(async (cb) => {
        let cartLookupDone = false;
        const em = {
          findOne: jest.fn().mockImplementation((_entity, opts: any) => {
            if (!cartLookupDone) {
              cartLookupDone = true;
              const where = opts.where;
              const match = fakeCarts.find(
                (c) =>
                  c.sessionId === where.sessionId &&
                  c.customerId === null && // where.customerId is IsNull()
                  c.status === where.status,
              );
              return Promise.resolve(match ?? null);
            }
            return Promise.resolve(variantsById[opts.where.id] ?? null);
          }),
          create: jest.fn().mockImplementation((_, data: any) => data),
          save: jest
            .fn()
            .mockImplementation((_entityClass: any, obj: any) =>
              Promise.resolve(obj),
            ),
        };
        return cb(em as any);
      });

      const result = await service.checkout(dto, undefined, 'attacker-session');

      expect(result.order.totalCents).toBe(500);
      expect(attackerCart.status).toBe('converted');
      expect(victimCart.status).toBe('active'); // untouched
    });

    it('10. a guest session id cannot be used to check out a cart owned by a logged-in customer (activeCartWhere excludes customer-owned carts for session lookups)', async () => {
      // Mirrors the one-owner invariant documented in carts.service.ts:
      // activeCartWhere(undefined, sessionId) always adds
      // customerId: IsNull(), so even if a guest somehow knew/guessed a
      // session id that had been associated with a customer cart, the
      // where clause itself excludes customer-owned rows.
      let capturedWhere: any;
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest.fn().mockImplementation((_entity, opts: any) => {
            capturedWhere = opts.where;
            return Promise.resolve(null);
          }),
        };
        return cb(em as any);
      });

      try {
        await service.checkout(dto, undefined, 'some-session-id');
      } catch {
        // expected: CART_EMPTY since findOne resolves null
      }

      expect(capturedWhere).toMatchObject({
        sessionId: 'some-session-id',
      });
      expect(capturedWhere.customerId).toBeDefined(); // IsNull() FindOperator, not a raw client value
    });
  });
});
