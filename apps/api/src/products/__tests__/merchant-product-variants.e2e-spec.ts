import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../app/app.module';
import { configureApp } from '../../bootstrap';
import { TenantDbService } from '../../db/tenant-db.service';
import { TokenService } from '../../auth-core/services/token.service';
import {
  Tenant,
  Product,
  ProductVariant,
  MerchantUser,
} from '../../db/entities';

describe('MerchantProductVariants (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let tenantDb: TenantDbService;
  let cls: ClsService;
  let tokenService: TokenService;

  let tenantId: string;
  let tenantHost: string;
  let adminToken: string;

  let productId: string;
  let initialVariantId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    dataSource = app.get<DataSource>(getDataSourceToken());
    tenantDb = app.get(TenantDbService);
    cls = app.get(ClsService);
    tokenService = app.get(TokenService);

    tenantHost = `merchant-variants-e2e-${randomUUID()}.localhost`;
    const tenant = await dataSource.getRepository(Tenant).save(
      dataSource.getRepository(Tenant).create({
        name: 'Merchant Variants E2E Test Tenant',
        host: tenantHost,
      }),
    );
    tenantId = tenant.id;

    // Create seed merchant admin and product with initial default variant
    await cls.run(async () => {
      cls.set('tenantId', tenantId);
      await tenantDb.run(async (manager) => {
        const admin = await manager.save(
          manager.create(MerchantUser, {
            tenantId,
            email: `admin-${randomUUID()}@example.com`,
            role: 'owner',
          }),
        );

        adminToken = tokenService.signAccessToken({
          sub: admin.id,
          aud: 'merchant_admin',
          tenantId,
          role: 'owner',
        });

        const product = await manager.save(
          manager.create(Product, {
            tenantId,
            title: 'Variant Test Product',
            status: 'active',
          }),
        );
        productId = product.id;

        const initialVariant = await manager.save(
          manager.create(ProductVariant, {
            tenantId,
            productId: product.id,
            sku: `INIT-SKU-${randomUUID()}`,
            priceCents: 1000,
            stock: 10,
            isDefault: true,
          }),
        );
        initialVariantId = initialVariant.id;
      });
    });
  });

  afterAll(async () => {
    await app.close();
  });

  let var1Id: string;
  let var2Id: string;

  describe('1. POST single variant & default auto-swap', () => {
    it('creates a new non-default variant', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/merchant-admins/products/${productId}/variants`)
        .set('Host', tenantHost)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sku: 'VAR-1-SKU',
          priceCents: 1500,
          stock: 25,
          isDefault: false,
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.sku).toBe('VAR-1-SKU');
      expect(res.body.priceCents).toBe(1500);
      expect(res.body.stock).toBe(25);
      expect(res.body.isDefault).toBe(false);
      var1Id = res.body.id;
    });

    it('creates a new default variant and auto-swaps previous default', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/merchant-admins/products/${productId}/variants`)
        .set('Host', tenantHost)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sku: 'VAR-2-SKU',
          priceCents: 2500,
          stock: 50,
          isDefault: true,
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.sku).toBe('VAR-2-SKU');
      expect(res.body.isDefault).toBe(true);
      var2Id = res.body.id;

      // Verify previous default variant (initialVariantId) was demoted to false
      const prevDefaultRes = await request(app.getHttpServer())
        .get(
          `/api/v1/merchant-admins/products/${productId}/variants/${initialVariantId}`,
        )
        .set('Host', tenantHost)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(prevDefaultRes.body.isDefault).toBe(false);
    });

    it('returns 409 Conflict when creating a variant with duplicate SKU', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/merchant-admins/products/${productId}/variants`)
        .set('Host', tenantHost)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sku: 'VAR-1-SKU',
          priceCents: 2000,
          stock: 10,
        })
        .expect(409);
    });
  });

  describe('2. GET list variants and single variant', () => {
    it('lists all variants belonging to the product', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/merchant-admins/products/${productId}/variants`)
        .set('Host', tenantHost)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(3);
      const ids = res.body.map((v: any) => v.id);
      expect(ids).toContain(initialVariantId);
      expect(ids).toContain(var1Id);
      expect(ids).toContain(var2Id);
    });

    it('gets a single variant by ID', async () => {
      const res = await request(app.getHttpServer())
        .get(
          `/api/v1/merchant-admins/products/${productId}/variants/${var1Id}`,
        )
        .set('Host', tenantHost)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.id).toBe(var1Id);
      expect(res.body.sku).toBe('VAR-1-SKU');
    });

    it('returns 404 Not Found for non-existent variant ID', async () => {
      await request(app.getHttpServer())
        .get(
          `/api/v1/merchant-admins/products/${productId}/variants/00000000-0000-0000-0000-000000000000`,
        )
        .set('Host', tenantHost)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('3. PATCH single variant stock/price/default', () => {
    it('updates stock and price of a variant', async () => {
      const res = await request(app.getHttpServer())
        .patch(
          `/api/v1/merchant-admins/products/${productId}/variants/${var1Id}`,
        )
        .set('Host', tenantHost)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          priceCents: 1800,
          stock: 100,
        })
        .expect(200);

      expect(res.body.id).toBe(var1Id);
      expect(res.body.priceCents).toBe(1800);
      expect(res.body.stock).toBe(100);
    });

    it('updates default status to true and demotes previous default', async () => {
      const res = await request(app.getHttpServer())
        .patch(
          `/api/v1/merchant-admins/products/${productId}/variants/${var1Id}`,
        )
        .set('Host', tenantHost)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          isDefault: true,
        })
        .expect(200);

      expect(res.body.id).toBe(var1Id);
      expect(res.body.isDefault).toBe(true);

      // Verify previous default (var2Id) was demoted
      const var2Res = await request(app.getHttpServer())
        .get(
          `/api/v1/merchant-admins/products/${productId}/variants/${var2Id}`,
        )
        .set('Host', tenantHost)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(var2Res.body.isDefault).toBe(false);
    });

    it('returns 400 Bad Request when setting default to false on current default variant', async () => {
      await request(app.getHttpServer())
        .patch(
          `/api/v1/merchant-admins/products/${productId}/variants/${var1Id}`,
        )
        .set('Host', tenantHost)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          isDefault: false,
        })
        .expect(400);
    });
  });

  describe('4. DELETE single variant & default promotion and minimum variant enforcement', () => {
    it('deletes a non-default variant (var2)', async () => {
      await request(app.getHttpServer())
        .delete(
          `/api/v1/merchant-admins/products/${productId}/variants/${var2Id}`,
        )
        .set('Host', tenantHost)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Verify var2 is deleted
      await request(app.getHttpServer())
        .get(
          `/api/v1/merchant-admins/products/${productId}/variants/${var2Id}`,
        )
        .set('Host', tenantHost)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('deletes current default variant (var1) and auto-promotes remaining variant (initialVariantId)', async () => {
      await request(app.getHttpServer())
        .delete(
          `/api/v1/merchant-admins/products/${productId}/variants/${var1Id}`,
        )
        .set('Host', tenantHost)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      // Verify remaining variant (initialVariantId) was promoted to default
      const remainingRes = await request(app.getHttpServer())
        .get(
          `/api/v1/merchant-admins/products/${productId}/variants/${initialVariantId}`,
        )
        .set('Host', tenantHost)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(remainingRes.body.isDefault).toBe(true);
    });

    it('returns 400 Bad Request when trying to delete the only variant of product', async () => {
      await request(app.getHttpServer())
        .delete(
          `/api/v1/merchant-admins/products/${productId}/variants/${initialVariantId}`,
        )
        .set('Host', tenantHost)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });
  });
});
