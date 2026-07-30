import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app/app.module';
import { TenantDbService } from '../src/db/tenant-db.service';
import {
  Tenant,
  Customer,
  Country,
  Product,
  ProductVariant,
  Cart,
  CartItem,
  CustomerAddress,
} from '../src/db/entities';

describe('Carts & customer addresses RLS isolation (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let tenantDb: TenantDbService;
  let cls: ClsService;
  let tenantAId: string;
  let tenantBId: string;

  let cartAId: string;
  let cartItemAId: string;
  let variantAId: string;
  let customerAId: string;
  let addressAId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = app.get(getDataSourceToken());
    tenantDb = app.get(TenantDbService);
    cls = app.get(ClsService);

    const tenantRepo = dataSource.getRepository(Tenant);
    const tenantA = await tenantRepo.save(
      tenantRepo.create({
        name: 'Carts/Addresses RLS Test Tenant A',
        host: `carts-addresses-rls-a-${randomUUID()}.localhost`,
      }),
    );
    const tenantB = await tenantRepo.save(
      tenantRepo.create({
        name: 'Carts/Addresses RLS Test Tenant B',
        host: `carts-addresses-rls-b-${randomUUID()}.localhost`,
      }),
    );
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    // Countries is global (no tenant_id, no RLS) — seed once, shared by both
    // tenant contexts.
    const countryRepo = dataSource.getRepository(Country);
    const existingCountry = await countryRepo.findOneBy({ code: 'US' });
    if (!existingCountry) {
      await countryRepo.save(
        countryRepo.create({ code: 'US', name: 'United States' }),
      );
    }

    // Seed Tenant A's cart/cart-item/address graph under Tenant A's own CLS
    // context, matching how the app itself would write these rows.
    await cls.run(() => {
      cls.set('tenantId', tenantAId);
      return tenantDb.run(async (manager) => {
        const product = await manager.save(
          manager.create(Product, {
            tenantId: tenantAId,
            title: 'RLS Test Shirt',
            status: 'active',
          }),
        );

        const variant = await manager.save(
          manager.create(ProductVariant, {
            tenantId: tenantAId,
            productId: product.id,
            sku: `RLS-CART-${randomUUID()}`,
            priceCents: 1200,
            stock: 10,
            isDefault: true,
          }),
        );
        variantAId = variant.id;

        const cart = await manager.save(
          manager.create(Cart, {
            tenantId: tenantAId,
            customerId: null,
            sessionId: randomUUID(),
            status: 'active',
          }),
        );
        cartAId = cart.id;

        const cartItem = await manager.save(
          manager.create(CartItem, {
            tenantId: tenantAId,
            cartId: cart.id,
            variantId: variant.id,
            qty: 2,
          }),
        );
        cartItemAId = cartItem.id;

        const customer = await manager.save(
          manager.create(Customer, {
            tenantId: tenantAId,
            email: `rls-address-${randomUUID()}@example.com`,
            name: 'RLS Address Customer A',
          }),
        );
        customerAId = customer.id;

        const address = await manager.save(
          manager.create(CustomerAddress, {
            tenantId: tenantAId,
            customerId: customer.id,
            firstName: 'Jane',
            lastName: 'Doe',
            line1: '123 Main St',
            city: 'Springfield',
            postalCode: '12345',
            countryCode: 'US',
          }),
        );
        addressAId = address.id;
      });
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Read isolation (USING policy)', () => {
    it('hides Tenant A carts, cart items, and addresses from Tenant B context', async () => {
      await cls.run(async () => {
        cls.set('tenantId', tenantBId);
        await tenantDb.run(async (manager) => {
          const carts = await manager.find(Cart, { where: { id: cartAId } });
          expect(carts).toHaveLength(0);

          const cartItems = await manager.find(CartItem, {
            where: { id: cartItemAId },
          });
          expect(cartItems).toHaveLength(0);

          const addresses = await manager.find(CustomerAddress, {
            where: { id: addressAId },
          });
          expect(addresses).toHaveLength(0);
        });
      });
    });

    it('shows Tenant A carts, cart items, and addresses in Tenant A context', async () => {
      await cls.run(async () => {
        cls.set('tenantId', tenantAId);
        await tenantDb.run(async (manager) => {
          const carts = await manager.find(Cart, { where: { id: cartAId } });
          expect(carts).toHaveLength(1);
          expect(carts[0].sessionId).toBeDefined();

          const cartItems = await manager.find(CartItem, {
            where: { id: cartItemAId },
          });
          expect(cartItems).toHaveLength(1);
          expect(cartItems[0].qty).toEqual(2);

          const addresses = await manager.find(CustomerAddress, {
            where: { id: addressAId },
          });
          expect(addresses).toHaveLength(1);
          expect(addresses[0].city).toEqual('Springfield');
        });
      });
    });
  });

  describe('Write enforcement (WITH CHECK policy)', () => {
    it('rejects cross-tenant insert of Cart with mismatched tenantId', async () => {
      const write = () =>
        cls.run(() => {
          cls.set('tenantId', tenantAId);
          return tenantDb.run((manager) =>
            manager.save(
              manager.create(Cart, {
                tenantId: tenantBId,
                customerId: null,
                sessionId: randomUUID(),
                status: 'active',
              }),
            ),
          );
        });

      await expect(write()).rejects.toThrow(
        /violates row-level security policy/i,
      );
    });

    it('rejects cross-tenant insert of CartItem with mismatched tenantId', async () => {
      const write = () =>
        cls.run(() => {
          cls.set('tenantId', tenantAId);
          return tenantDb.run((manager) =>
            manager.save(
              manager.create(CartItem, {
                tenantId: tenantBId,
                cartId: cartAId,
                variantId: variantAId,
                qty: 1,
              }),
            ),
          );
        });

      await expect(write()).rejects.toThrow(
        /violates row-level security policy/i,
      );
    });

    it('rejects cross-tenant insert of CustomerAddress with mismatched tenantId', async () => {
      const write = () =>
        cls.run(() => {
          cls.set('tenantId', tenantAId);
          return tenantDb.run((manager) =>
            manager.save(
              manager.create(CustomerAddress, {
                tenantId: tenantBId,
                customerId: customerAId,
                firstName: 'Forged',
                lastName: 'Address',
                line1: '999 Nowhere St',
                city: 'Nowhere',
                postalCode: '00000',
                countryCode: 'US',
              }),
            ),
          );
        });

      await expect(write()).rejects.toThrow(
        /violates row-level security policy/i,
      );
    });

    it('rejects insert of Cart omitting tenantId', async () => {
      const write = () =>
        cls.run(() => {
          cls.set('tenantId', tenantAId);
          return tenantDb.run((manager) =>
            manager.save(
              manager.create(Cart, {
                customerId: null,
                sessionId: randomUUID(),
                status: 'active',
              } as any),
            ),
          );
        });

      await expect(write()).rejects.toThrow(
        /violates row-level security policy/i,
      );
    });

    it('rejects insert of CartItem omitting tenantId', async () => {
      const write = () =>
        cls.run(() => {
          cls.set('tenantId', tenantAId);
          return tenantDb.run((manager) =>
            manager.save(
              manager.create(CartItem, {
                cartId: cartAId,
                variantId: variantAId,
                qty: 1,
              } as any),
            ),
          );
        });

      await expect(write()).rejects.toThrow(
        /violates row-level security policy/i,
      );
    });

    it('rejects insert of CustomerAddress omitting tenantId', async () => {
      const write = () =>
        cls.run(() => {
          cls.set('tenantId', tenantAId);
          return tenantDb.run((manager) =>
            manager.save(
              manager.create(CustomerAddress, {
                customerId: customerAId,
                firstName: 'No',
                lastName: 'Tenant',
                line1: '1 No Tenant Way',
                city: 'Nowhere',
                postalCode: '00000',
                countryCode: 'US',
              } as any),
            ),
          );
        });

      await expect(write()).rejects.toThrow(
        /violates row-level security policy/i,
      );
    });
  });
});
