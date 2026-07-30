import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app/app.module';
import { TenantDbService } from '../src/db/tenant-db.service';
import {
  Product,
  ProductVariant,
  Category,
  ProductCategory,
  Tenant,
} from '../src/db/entities';

describe('Products module RLS isolation (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let tenantDb: TenantDbService;
  let cls: ClsService;
  let tenantAId: string;
  let tenantBId: string;

  let productAId: string;
  let variantAId: string;
  let categoryAId: string;

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
        name: 'Products RLS Test Tenant A',
        host: `products-rls-a-${randomUUID()}.localhost`,
      }),
    );
    const tenantB = await tenantRepo.save(
      tenantRepo.create({
        name: 'Products RLS Test Tenant B',
        host: `products-rls-b-${randomUUID()}.localhost`,
      }),
    );
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    // Create seed data in Tenant A context
    await cls.run(() => {
      cls.set('tenantId', tenantAId);
      return tenantDb.run(async (manager) => {
        const categoryA = await manager.save(
          manager.create(Category, {
            tenantId: tenantAId,
            name: 'Apparel A',
            parentId: null,
          }),
        );
        categoryAId = categoryA.id;

        const productA = await manager.save(
          manager.create(Product, {
            tenantId: tenantAId,
            title: 'T-Shirt A',
            status: 'active',
          }),
        );
        productAId = productA.id;

        const variantA = await manager.save(
          manager.create(ProductVariant, {
            tenantId: tenantAId,
            productId: productA.id,
            sku: `SKU-A-${randomUUID()}`,
            priceCents: 2999,
            stock: 10,
            isDefault: true,
          }),
        );
        variantAId = variantA.id;

        await manager.save(
          manager.create(ProductCategory, {
            tenantId: tenantAId,
            productId: productA.id,
            categoryId: categoryA.id,
          }),
        );
      });
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Read isolation (USING policy)', () => {
    it('hides Tenant A products, variants, categories, and product_categories from Tenant B context', async () => {
      await cls.run(async () => {
        cls.set('tenantId', tenantBId);
        await tenantDb.run(async (manager) => {
          const products = await manager.find(Product, {
            where: { id: productAId },
          });
          expect(products).toHaveLength(0);

          const variants = await manager.find(ProductVariant, {
            where: { id: variantAId },
          });
          expect(variants).toHaveLength(0);

          const categories = await manager.find(Category, {
            where: { id: categoryAId },
          });
          expect(categories).toHaveLength(0);

          const productCategories = await manager.find(ProductCategory, {
            where: { productId: productAId },
          });
          expect(productCategories).toHaveLength(0);
        });
      });
    });

    it('shows Tenant A records when queried in Tenant A context', async () => {
      await cls.run(async () => {
        cls.set('tenantId', tenantAId);
        await tenantDb.run(async (manager) => {
          const products = await manager.find(Product, {
            where: { id: productAId },
          });
          expect(products).toHaveLength(1);
          expect(products[0].title).toEqual('T-Shirt A');

          const variants = await manager.find(ProductVariant, {
            where: { id: variantAId },
          });
          expect(variants).toHaveLength(1);

          const categories = await manager.find(Category, {
            where: { id: categoryAId },
          });
          expect(categories).toHaveLength(1);
        });
      });
    });
  });

  describe('Write enforcement (WITH CHECK policy)', () => {
    it('rejects cross-tenant insert of Product with mismatched tenantId', async () => {
      const write = () =>
        cls.run(() => {
          cls.set('tenantId', tenantAId);
          return tenantDb.run((manager) =>
            manager.save(
              manager.create(Product, {
                tenantId: tenantBId,
                title: 'Forged Product',
                status: 'active',
              }),
            ),
          );
        });

      await expect(write()).rejects.toThrow(
        /violates row-level security policy/i,
      );
    });

    it('rejects cross-tenant insert of ProductVariant with mismatched tenantId', async () => {
      const write = () =>
        cls.run(() => {
          cls.set('tenantId', tenantAId);
          return tenantDb.run((manager) =>
            manager.save(
              manager.create(ProductVariant, {
                tenantId: tenantBId,
                productId: productAId,
                sku: `SKU-FORGED-${randomUUID()}`,
                priceCents: 1000,
                stock: 5,
                isDefault: false,
              }),
            ),
          );
        });

      await expect(write()).rejects.toThrow(
        /violates row-level security policy/i,
      );
    });

    it('rejects cross-tenant insert of Category with mismatched tenantId', async () => {
      const write = () =>
        cls.run(() => {
          cls.set('tenantId', tenantAId);
          return tenantDb.run((manager) =>
            manager.save(
              manager.create(Category, {
                tenantId: tenantBId,
                name: 'Forged Category',
              }),
            ),
          );
        });

      await expect(write()).rejects.toThrow(
        /violates row-level security policy/i,
      );
    });

    it('rejects insert of Product omitting tenantId', async () => {
      const write = () =>
        cls.run(() => {
          cls.set('tenantId', tenantAId);
          return tenantDb.run((manager) =>
            manager.save(
              manager.create(Product, {
                title: 'No Tenant Product',
                status: 'active',
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
