import { Injectable } from '@nestjs/common';
import { EntityManager, FindOptionsWhere, IsNull } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { TenantDbService } from '../db/tenant-db.service';
import { Cart } from '../db/entities/carts.entity';
import { CartItem } from '../db/entities/cart-items.entity';
import { ProductVariant } from '../db/entities/product-variants.entity';
import {
  CodedNotFoundException,
  CodedBadRequestException,
} from '../common/errors/coded-exceptions';
import { ErrorCode } from '@tiny-threads/shared';

const CART_RELATIONS = { items: { variant: { product: true } } };

// Postgres unique_violation. Raised by the partial unique indexes added in
// 1785310000000-AddCartsActiveUniqueIndexes when two concurrent requests race
// to create the first active cart for the same customer/session.
const PG_UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === PG_UNIQUE_VIOLATION
  );
}

// A cart is owned by EITHER a customer OR a guest session, never both. That
// invariant is what makes session-based lookups safe: without the explicit
// `customerId: IsNull()` below, a guest session id that had been stamped onto
// a logged-in customer's cart would let any anonymous request carrying that
// session id read and mutate the customer's cart.
export function activeCartWhere(
  customerId?: string,
  sessionId?: string,
): FindOptionsWhere<Cart> {
  return customerId
    ? { customerId, status: 'active' }
    : { sessionId, customerId: IsNull(), status: 'active' };
}

@Injectable()
export class CartsService {
  constructor(
    private readonly tenantDb: TenantDbService,
    private readonly cls: ClsService,
  ) {}

  async getOrCreateCart(
    customerId?: string,
    sessionId?: string,
  ): Promise<Cart> {
    if (!customerId && !sessionId) {
      throw new CodedBadRequestException(
        ErrorCode.VALIDATION_FAILED,
        'Either customerId or sessionId must be provided',
      );
    }

    return this.tenantDb.run((em) =>
      this.findOrCreateCart(em, customerId, sessionId),
    );
  }

  // Read-only counterpart to getOrCreateCart, for routes that mutate an
  // existing cart item (PATCH/DELETE /cart/items/:id). Those must not create
  // a cart: doing so lets any unseen x-guest-session-id insert a row, and the
  // request would then fail with CART_ITEM_NOT_FOUND anyway.
  async getActiveCart(customerId?: string, sessionId?: string): Promise<Cart> {
    if (!customerId && !sessionId) {
      throw new CodedBadRequestException(
        ErrorCode.VALIDATION_FAILED,
        'Either customerId or sessionId must be provided',
      );
    }

    return this.tenantDb.run(async (em) => {
      const cart = await em.findOne(Cart, {
        where: activeCartWhere(customerId, sessionId),
        relations: CART_RELATIONS,
      });
      if (!cart) {
        throw new CodedNotFoundException(
          ErrorCode.CART_NOT_FOUND,
          'Cart not found',
        );
      }
      return cart;
    });
  }

  async addItem(cartId: string, variantId: string, qty: number): Promise<Cart> {
    return this.tenantDb.run(async (em) => {
      const cart = await em.findOne(Cart, {
        where: { id: cartId, status: 'active' },
        relations: { items: true },
      });
      if (!cart) {
        throw new CodedNotFoundException(
          ErrorCode.CART_NOT_FOUND,
          'Cart not found',
        );
      }

      const variant = await em.findOne(ProductVariant, {
        where: { id: variantId },
      });
      if (!variant) {
        throw new CodedNotFoundException(
          ErrorCode.PRODUCT_VARIANT_NOT_FOUND,
          'Product variant not found',
        );
      }

      const existingItem = cart.items?.find(
        (item) => item.variantId === variantId,
      );
      if (existingItem) {
        existingItem.qty += qty;
        await em.save(CartItem, existingItem);
      } else {
        const newItem = em.create(CartItem, {
          tenantId: this.cls.get<string>('tenantId'),
          cartId: cart.id,
          variantId,
          qty,
        });
        await em.save(CartItem, newItem);
      }

      return this.loadCart(em, cart.id);
    });
  }

  async updateItemQty(
    cartId: string,
    itemId: string,
    qty: number,
  ): Promise<Cart> {
    return this.tenantDb.run((em) =>
      this.applyItemQty(em, cartId, itemId, qty),
    );
  }

  async removeItem(cartId: string, itemId: string): Promise<Cart> {
    return this.tenantDb.run((em) => this.applyItemQty(em, cartId, itemId, 0));
  }

  async mergeCart(customerId: string, guestSessionId: string): Promise<Cart> {
    return this.tenantDb.run(async (em) => {
      const customerCart = await this.findOrCreateCart(
        em,
        customerId,
        undefined,
      );
      const guestCart = await em.findOne(Cart, {
        where: activeCartWhere(undefined, guestSessionId),
        relations: { items: true },
      });

      if (!guestCart || !guestCart.items || guestCart.items.length === 0) {
        return customerCart;
      }

      // Defence in depth: activeCartWhere already excludes customer-owned
      // carts, so the guest cart can no longer BE the customer's own cart.
      // Cheap to keep, and merging a cart into itself would double its own
      // quantities and then mark the customer's active cart abandoned.
      if (guestCart.id === customerCart.id) {
        return customerCart;
      }

      for (const guestItem of guestCart.items) {
        const existingItem = customerCart.items?.find(
          (item) => item.variantId === guestItem.variantId,
        );
        if (existingItem) {
          existingItem.qty += guestItem.qty;
          await em.save(CartItem, existingItem);
        } else {
          const newItem = em.create(CartItem, {
            tenantId: this.cls.get<string>('tenantId'),
            cartId: customerCart.id,
            variantId: guestItem.variantId,
            qty: guestItem.qty,
          });
          await em.save(CartItem, newItem);
        }
      }

      guestCart.status = 'abandoned';
      await em.save(Cart, guestCart);

      return this.loadCart(em, customerCart.id);
    });
  }

  // Shared by getOrCreateCart and mergeCart — both need "find the active
  // cart for this customer/session or create one" but must run inside their
  // own single tenantDb.run transaction, so this takes `em` directly rather
  // than calling the public getOrCreateCart (which would nest transactions).
  private async findOrCreateCart(
    em: EntityManager,
    customerId?: string,
    sessionId?: string,
  ): Promise<Cart> {
    const whereCondition = activeCartWhere(customerId, sessionId);

    const existing = await em.findOne(Cart, {
      where: whereCondition,
      relations: CART_RELATIONS,
    });
    if (existing) {
      return existing;
    }

    // `sessionId: customerId ? null : ...` is the write-side half of the
    // one-owner invariant: clients keep sending x-guest-session-id after
    // login, and stamping that id onto the customer's cart would hand anyone
    // holding it full read/write access to the customer's cart.
    const newCart = em.create(Cart, {
      tenantId: this.cls.get<string>('tenantId'),
      customerId: customerId ?? null,
      sessionId: customerId ? null : (sessionId ?? null),
      status: 'active',
    });

    // The SAVEPOINT is what makes losing the create race recoverable: a
    // unique-violation aborts the surrounding withTenant transaction, so
    // without rolling back to a savepoint first the re-read below would fail
    // too and the client would still get a 500.
    await em.query('SAVEPOINT create_cart');
    try {
      const cart = await em.save(Cart, newCart);
      await em.query('RELEASE SAVEPOINT create_cart');
      cart.items = [];
      return cart;
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      await em.query('ROLLBACK TO SAVEPOINT create_cart');
      const raced = await em.findOne(Cart, {
        where: whereCondition,
        relations: CART_RELATIONS,
      });
      if (!raced) {
        throw error;
      }
      return raced;
    }
  }

  // Shared by updateItemQty and removeItem (qty=0). Each public method opens
  // its own single tenantDb.run and delegates here with its own `em`, so
  // there is no nesting and no second read-back transaction.
  private async applyItemQty(
    em: EntityManager,
    cartId: string,
    itemId: string,
    qty: number,
  ): Promise<Cart> {
    const item = await em.findOne(CartItem, { where: { id: itemId, cartId } });
    if (!item) {
      throw new CodedNotFoundException(
        ErrorCode.CART_ITEM_NOT_FOUND,
        'Cart item not found',
      );
    }

    if (qty <= 0) {
      await em.remove(CartItem, item);
    } else {
      item.qty = qty;
      await em.save(CartItem, item);
    }

    return this.loadCart(em, cartId);
  }

  // Loads the full cart with items/variant/product relations. Takes `em` so
  // callers can invoke it from inside the same transaction that did the
  // writes, instead of opening a second (nested) tenantDb.run.
  private async loadCart(em: EntityManager, cartId: string): Promise<Cart> {
    const cart = await em.findOne(Cart, {
      where: { id: cartId },
      relations: CART_RELATIONS,
    });
    if (!cart) {
      throw new CodedNotFoundException(
        ErrorCode.CART_NOT_FOUND,
        'Cart not found',
      );
    }
    return cart;
  }
}
