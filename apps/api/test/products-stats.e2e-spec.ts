import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app/app.module';
import { TenantDbService } from '../src/db/tenant-db.service';
import { ProductsService } from '../src/products/services/products.service';
import {
  Product,
  ProductVariant,
  Tenant,
  TenantSettings,
} from '../src/db/entities';

describe('ProductsService.getStats (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let tenantDb: TenantDbService;
  let cls: ClsService;
  let productsService: ProductsService;
  let tenantId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = app.get(getDataSourceToken());
    tenantDb = app.get(TenantDbService);
    cls = app.get(ClsService);
    productsService = app.get(ProductsService);

    const tenantRepo = dataSource.getRepository(Tenant);
    const tenant = await tenantRepo.save(
      tenantRepo.create({
        name: 'Products Stats Test Tenant',
        host: `products-stats-${randomUUID()}.localhost`,
      }),
    );
    tenantId = tenant.id;

    await cls.run(() => {
      cls.set('tenantId', tenantId);
      return tenantDb.run(async (manager) => {
        await manager.save(
          manager.create(TenantSettings, { tenantId, lowStockThreshold: 10 }),
        );

        async function seedProduct(
          title: string,
          status: 'active' | 'draft',
          stock: number,
        ) {
          const product = await manager.save(
            manager.create(Product, { tenantId, title, status }),
          );
          await manager.save(
            manager.create(ProductVariant, {
              tenantId,
              productId: product.id,
              sku: `SKU-${randomUUID()}`,
              priceCents: 1000,
              stock,
              isDefault: true,
            }),
          );
        }

        await seedProduct('Well Stocked', 'active', 100);
        await seedProduct('Low Stock Item', 'active', 5);
        await seedProduct('Out Of Stock Item', 'active', 0);
        await seedProduct('Draft Item', 'draft', 0);
      });
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('executes against real Postgres and buckets active products by the tenant low-stock threshold', async () => {
    await cls.run(async () => {
      cls.set('tenantId', tenantId);
      const stats = await productsService.getStats();
      expect(stats).toEqual({
        totalProducts: 4,
        activeListings: 3,
        lowStock: 1,
        outOfStock: 1,
      });
    });
  });
});
