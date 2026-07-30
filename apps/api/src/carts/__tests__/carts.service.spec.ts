/* eslint-disable @typescript-eslint/unbound-method */
import { CartsService } from '../carts.service';
import { TenantDbService } from '../../db/tenant-db.service';
import { ClsService } from 'nestjs-cls';
import {
  CodedNotFoundException,
  CodedBadRequestException,
} from '../../common/errors/coded-exceptions';

describe('CartsService', () => {
  let service: CartsService;
  let tenantDbService: jest.Mocked<TenantDbService>;
  let clsService: jest.Mocked<ClsService>;

  beforeEach(() => {
    tenantDbService = {
      run: jest.fn(),
    } as unknown as jest.Mocked<TenantDbService>;
    clsService = {
      get: jest.fn().mockReturnValue('tenant-123'),
    } as unknown as jest.Mocked<ClsService>;
    service = new CartsService(tenantDbService, clsService);
  });

  describe('getOrCreateCart', () => {
    it('should return existing active cart for customer', async () => {
      const existingCart = {
        id: 'cart-1',
        customerId: 'cust-1',
        status: 'active',
        items: [],
      };
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = { findOne: jest.fn().mockResolvedValue(existingCart) };
        return cb(em as any);
      });

      const cart = await service.getOrCreateCart('cust-1', undefined);
      expect(cart).toEqual(existingCart);
      expect(tenantDbService.run).toHaveBeenCalledTimes(1);
    });

    it('should create new active cart if none exists', async () => {
      const newCart = {
        id: 'cart-2',
        customerId: 'cust-1',
        status: 'active',
      };
      let created: any;
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockImplementation((_, entity) => {
            created = entity;
            return entity;
          }),
          save: jest.fn().mockResolvedValue(newCart),
        };
        return cb(em as any);
      });

      const cart = await service.getOrCreateCart('cust-1', undefined);
      expect(cart).toEqual({ ...newCart, items: [] });
      expect(created).toEqual(
        expect.objectContaining({
          tenantId: 'tenant-123',
          customerId: 'cust-1',
          status: 'active',
        }),
      );
    });

    it('should look up an existing cart by sessionId for guest carts', async () => {
      const existingCart = {
        id: 'cart-3',
        sessionId: 'sess-1',
        status: 'active',
        items: [],
      };
      let whereUsed: any;
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest.fn().mockImplementation((_, options) => {
            whereUsed = options.where;
            return Promise.resolve(existingCart);
          }),
        };
        return cb(em as any);
      });

      const cart = await service.getOrCreateCart(undefined, 'sess-1');
      expect(cart).toEqual(existingCart);
      expect(whereUsed).toEqual({ sessionId: 'sess-1', status: 'active' });
    });

    it('should throw CodedBadRequestException when neither customerId nor sessionId is provided', async () => {
      await expect(
        service.getOrCreateCart(undefined, undefined),
      ).rejects.toThrow(CodedBadRequestException);
      expect(tenantDbService.run).not.toHaveBeenCalled();
    });
  });

  describe('addItem', () => {
    it('should throw CodedNotFoundException if cart does not exist', async () => {
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = { findOne: jest.fn().mockResolvedValue(null) };
        return cb(em as any);
      });

      await expect(
        service.addItem('missing-cart', 'variant-1', 1),
      ).rejects.toThrow(CodedNotFoundException);
    });

    it('should throw CodedNotFoundException if product variant does not exist', async () => {
      const cart = { id: 'cart-1', items: [] };
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest
            .fn()
            .mockResolvedValueOnce(cart)
            .mockResolvedValueOnce(null),
        };
        return cb(em as any);
      });

      await expect(
        service.addItem(cart.id, 'invalid-variant', 1),
      ).rejects.toThrow(CodedNotFoundException);
    });

    it('should increment qty when the variant is already in the cart', async () => {
      const existingItem = { id: 'item-1', variantId: 'variant-1', qty: 2 };
      const cart = { id: 'cart-1', items: [existingItem] };
      const variant = { id: 'variant-1' };
      const reloadedCart = {
        id: 'cart-1',
        items: [{ ...existingItem, qty: 5 }],
      };

      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest
            .fn()
            .mockResolvedValueOnce(cart)
            .mockResolvedValueOnce(variant)
            .mockResolvedValueOnce(reloadedCart),
          save: jest.fn().mockResolvedValue(existingItem),
        };
        return cb(em as any);
      });

      const result = await service.addItem('cart-1', 'variant-1', 3);
      expect(existingItem.qty).toBe(5);
      expect(result).toEqual(reloadedCart);
      expect(tenantDbService.run).toHaveBeenCalledTimes(1);
    });

    it('should create a new cart item when the variant is not already in the cart', async () => {
      const cart = { id: 'cart-1', items: [] };
      const variant = { id: 'variant-2' };
      const reloadedCart = {
        id: 'cart-1',
        items: [{ id: 'item-2', variantId: 'variant-2', qty: 1 }],
      };
      let createdItem: any;

      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest
            .fn()
            .mockResolvedValueOnce(cart)
            .mockResolvedValueOnce(variant)
            .mockResolvedValueOnce(reloadedCart),
          create: jest.fn().mockImplementation((_, entity) => {
            createdItem = entity;
            return entity;
          }),
          save: jest.fn().mockResolvedValue(undefined),
        };
        return cb(em as any);
      });

      const result = await service.addItem('cart-1', 'variant-2', 1);
      expect(createdItem).toEqual(
        expect.objectContaining({
          tenantId: 'tenant-123',
          cartId: 'cart-1',
          variantId: 'variant-2',
          qty: 1,
        }),
      );
      expect(result).toEqual(reloadedCart);
      expect(tenantDbService.run).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateItemQty', () => {
    it('should throw CodedNotFoundException if cart item does not exist', async () => {
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = { findOne: jest.fn().mockResolvedValue(null) };
        return cb(em as any);
      });

      await expect(
        service.updateItemQty('cart-1', 'missing-item', 2),
      ).rejects.toThrow(CodedNotFoundException);
    });

    it('should update the quantity when qty > 0', async () => {
      const item = { id: 'item-1', cartId: 'cart-1', qty: 1 };
      const reloadedCart = {
        id: 'cart-1',
        items: [{ ...item, qty: 4 }],
      };
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest
            .fn()
            .mockResolvedValueOnce(item)
            .mockResolvedValueOnce(reloadedCart),
          save: jest.fn().mockResolvedValue(item),
        };
        return cb(em as any);
      });

      const result = await service.updateItemQty('cart-1', 'item-1', 4);
      expect(item.qty).toBe(4);
      expect(result).toEqual(reloadedCart);
      expect(tenantDbService.run).toHaveBeenCalledTimes(1);
    });

    it('should remove the item when qty <= 0', async () => {
      const item = { id: 'item-1', cartId: 'cart-1', qty: 1 };
      const reloadedCart = { id: 'cart-1', items: [] };
      let removed: any;
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest
            .fn()
            .mockResolvedValueOnce(item)
            .mockResolvedValueOnce(reloadedCart),
          remove: jest.fn().mockImplementation((_, entity) => {
            removed = entity;
            return Promise.resolve(entity);
          }),
        };
        return cb(em as any);
      });

      const result = await service.updateItemQty('cart-1', 'item-1', 0);
      expect(removed).toEqual(item);
      expect(result).toEqual(reloadedCart);
    });
  });

  describe('removeItem', () => {
    it('should remove the item via its own single transaction', async () => {
      const item = { id: 'item-1', cartId: 'cart-1', qty: 1 };
      const reloadedCart = { id: 'cart-1', items: [] };
      let removed: any;
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest
            .fn()
            .mockResolvedValueOnce(item)
            .mockResolvedValueOnce(reloadedCart),
          remove: jest.fn().mockImplementation((_, entity) => {
            removed = entity;
            return Promise.resolve(entity);
          }),
        };
        return cb(em as any);
      });

      const result = await service.removeItem('cart-1', 'item-1');
      expect(removed).toEqual(item);
      expect(result).toEqual(reloadedCart);
      expect(tenantDbService.run).toHaveBeenCalledTimes(1);
    });

    it('should throw CodedNotFoundException if the item does not exist', async () => {
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = { findOne: jest.fn().mockResolvedValue(null) };
        return cb(em as any);
      });

      await expect(
        service.removeItem('cart-1', 'missing-item'),
      ).rejects.toThrow(CodedNotFoundException);
    });
  });

  describe('mergeCart', () => {
    it('should return the customer cart unchanged if there is no active guest cart', async () => {
      const customerCart = { id: 'cart-1', customerId: 'cust-1', items: [] };
      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest
            .fn()
            .mockResolvedValueOnce(customerCart) // findOrCreateCart lookup
            .mockResolvedValueOnce(null), // guest cart lookup
        };
        return cb(em as any);
      });

      const result = await service.mergeCart('cust-1', 'guest-sess-1');
      expect(result).toEqual(customerCart);
      expect(tenantDbService.run).toHaveBeenCalledTimes(1);
    });

    it('should sum quantities for duplicate variants and mark the guest cart abandoned', async () => {
      const customerCart = {
        id: 'cart-1',
        customerId: 'cust-1',
        items: [{ id: 'item-1', variantId: 'variant-1', qty: 2 }],
      };
      const guestCart = {
        id: 'cart-2',
        sessionId: 'guest-sess-1',
        status: 'active',
        items: [{ id: 'item-2', variantId: 'variant-1', qty: 3 }],
      };
      const reloadedCart = {
        id: 'cart-1',
        items: [{ id: 'item-1', variantId: 'variant-1', qty: 5 }],
      };
      const savedEntities: any[] = [];

      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest
            .fn()
            .mockResolvedValueOnce(customerCart) // findOrCreateCart lookup
            .mockResolvedValueOnce(guestCart) // guest cart lookup
            .mockResolvedValueOnce(reloadedCart), // final loadCart
          save: jest.fn().mockImplementation((_, entity) => {
            savedEntities.push(entity);
            return Promise.resolve(entity);
          }),
        };
        return cb(em as any);
      });

      const result = await service.mergeCart('cust-1', 'guest-sess-1');
      expect(customerCart.items[0].qty).toBe(5);
      expect(guestCart.status).toBe('abandoned');
      expect(result).toEqual(reloadedCart);
      expect(tenantDbService.run).toHaveBeenCalledTimes(1);
    });

    it('should add a new item for variants only present in the guest cart', async () => {
      const customerCart = {
        id: 'cart-1',
        customerId: 'cust-1',
        items: [],
      };
      const guestCart = {
        id: 'cart-2',
        sessionId: 'guest-sess-1',
        status: 'active',
        items: [{ id: 'item-2', variantId: 'variant-9', qty: 1 }],
      };
      const reloadedCart = {
        id: 'cart-1',
        items: [{ id: 'item-3', variantId: 'variant-9', qty: 1 }],
      };
      let createdItem: any;

      tenantDbService.run.mockImplementation(async (cb) => {
        const em = {
          findOne: jest
            .fn()
            .mockResolvedValueOnce(customerCart)
            .mockResolvedValueOnce(guestCart)
            .mockResolvedValueOnce(reloadedCart),
          create: jest.fn().mockImplementation((_, entity) => {
            createdItem = entity;
            return entity;
          }),
          save: jest.fn().mockResolvedValue(undefined),
        };
        return cb(em as any);
      });

      const result = await service.mergeCart('cust-1', 'guest-sess-1');
      expect(createdItem).toEqual(
        expect.objectContaining({
          tenantId: 'tenant-123',
          cartId: 'cart-1',
          variantId: 'variant-9',
          qty: 1,
        }),
      );
      expect(result).toEqual(reloadedCart);
    });
  });

  describe('transaction structure', () => {
    it('should open exactly one tenantDb.run per public method call, never nested', async () => {
      const runCallDepths: number[] = [];
      let depth = 0;
      tenantDbService.run.mockImplementation(async (cb) => {
        depth += 1;
        runCallDepths.push(depth);
        const em = {
          findOne: jest.fn().mockResolvedValue({ id: 'cart-1', items: [] }),
        };
        const result = await cb(em as any);
        depth -= 1;
        return result;
      });

      await service.getOrCreateCart('cust-1', undefined);
      expect(Math.max(...runCallDepths)).toBe(1);
    });
  });
});
