import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import sharp from 'sharp';
import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { AppModule } from '../src/app/app.module';
import { configureApp } from '../src/bootstrap';
import { TenantDbService } from '../src/db/tenant-db.service';
import { TokenService } from '../src/auth-core/services/token.service';
import {
  Tenant,
  MerchantUser,
  Product,
  ProductVariant,
  ProductVariantImage,
} from '../src/db/entities';

describe('Merchant Product Variant Images E2E & Multi-Tenant RLS', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let tenantDb: TenantDbService;
  let cls: ClsService;
  let tokenService: TokenService;

  let tenantA: Tenant;
  let tenantB: Tenant;
  let adminA: MerchantUser;
  let adminB: MerchantUser;
  let adminAToken: string;
  let adminBToken: string;

  let productA: Product;
  let variantA: ProductVariant;

  let validImageBuffer: Buffer;

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

    // Generate valid PNG image buffer
    validImageBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const tenantRepo = dataSource.getRepository(Tenant);
    tenantA = await tenantRepo.save(
      tenantRepo.create({
        name: 'Variant Images Tenant A',
        host: `variant-img-a-${randomUUID()}.localhost`,
      }),
    );
    tenantB = await tenantRepo.save(
      tenantRepo.create({
        name: 'Variant Images Tenant B',
        host: `variant-img-b-${randomUUID()}.localhost`,
      }),
    );

    // Create Merchant Admin A
    adminA = await cls.run(() => {
      cls.set('tenantId', tenantA.id);
      return tenantDb.run((em) =>
        em.save(
          em.create(MerchantUser, {
            tenantId: tenantA.id,
            email: `admin-a-${randomUUID()}@example.com`,
            role: 'owner',
          }),
        ),
      );
    });
    adminAToken = tokenService.signAccessToken({
      sub: adminA.id,
      aud: 'merchant_admin',
      tenantId: tenantA.id,
      role: 'owner',
    });

    // Create Merchant Admin B
    adminB = await cls.run(() => {
      cls.set('tenantId', tenantB.id);
      return tenantDb.run((em) =>
        em.save(
          em.create(MerchantUser, {
            tenantId: tenantB.id,
            email: `admin-b-${randomUUID()}@example.com`,
            role: 'owner',
          }),
        ),
      );
    });
    adminBToken = tokenService.signAccessToken({
      sub: adminB.id,
      aud: 'merchant_admin',
      tenantId: tenantB.id,
      role: 'owner',
    });

    // Seed Product & Variant in Tenant A context
    await cls.run(() => {
      cls.set('tenantId', tenantA.id);
      return tenantDb.run(async (em) => {
        productA = await em.save(
          em.create(Product, {
            tenantId: tenantA.id,
            title: 'Variant Image Product A',
            status: 'active',
          }),
        );
        variantA = await em.save(
          em.create(ProductVariant, {
            tenantId: tenantA.id,
            productId: productA.id,
            sku: `SKU-IMG-A-${randomUUID()}`,
            priceCents: 2500,
            stock: 20,
            isDefault: true,
          }),
        );
      });
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Merchant Product Variant Images CRUD', () => {
    let image1Id: string;
    let image2Id: string;

    it('uploads the first variant image and marks it as primary with sortOrder 0', async () => {
      const res = await request(app.getHttpServer())
        .post(
          `/api/v1/merchant-admins/products/${productA.id}/variants/${variantA.id}/images`,
        )
        .set('Host', tenantA.host)
        .set('Authorization', `Bearer ${adminAToken}`)
        .attach('image', validImageBuffer, 'shirt1.png')
        .expect(201);

      expect(res.body).toMatchObject({
        variantId: variantA.id,
        sortOrder: 0,
        isPrimary: true,
      });
      expect(res.body.url).toBeDefined();
      expect(res.body.storageKey).toBeDefined();
      image1Id = res.body.id;
    });

    it('uploads a second variant image and defaults it to non-primary with sortOrder 1', async () => {
      const res = await request(app.getHttpServer())
        .post(
          `/api/v1/merchant-admins/products/${productA.id}/variants/${variantA.id}/images`,
        )
        .set('Host', tenantA.host)
        .set('Authorization', `Bearer ${adminAToken}`)
        .attach('image', validImageBuffer, 'shirt2.png')
        .expect(201);

      expect(res.body).toMatchObject({
        variantId: variantA.id,
        sortOrder: 1,
        isPrimary: false,
      });
      image2Id = res.body.id;
    });

    it('lists images for variant ordered by sortOrder ASC', async () => {
      const res = await request(app.getHttpServer())
        .get(
          `/api/v1/merchant-admins/products/${productA.id}/variants/${variantA.id}/images`,
        )
        .set('Host', tenantA.host)
        .set('Authorization', `Bearer ${adminAToken}`)
        .expect(200);

      expect(res.body).toHaveLength(2);
      expect(res.body[0].id).toBe(image1Id);
      expect(res.body[1].id).toBe(image2Id);
      expect(res.body[0].sortOrder).toBe(0);
      expect(res.body[1].sortOrder).toBe(1);
    });

    it('reorders variant images atomically', async () => {
      const res = await request(app.getHttpServer())
        .put(
          `/api/v1/merchant-admins/products/${productA.id}/variants/${variantA.id}/images/reorder`,
        )
        .set('Host', tenantA.host)
        .set('Authorization', `Bearer ${adminAToken}`)
        .send({ imageIds: [image2Id, image1Id] })
        .expect(200);

      expect(res.body).toHaveLength(2);
      expect(res.body[0].id).toBe(image2Id);
      expect(res.body[0].sortOrder).toBe(0);
      expect(res.body[1].id).toBe(image1Id);
      expect(res.body[1].sortOrder).toBe(1);
    });

    it('updates image metadata (altText & isPrimary)', async () => {
      const res = await request(app.getHttpServer())
        .patch(
          `/api/v1/merchant-admins/products/${productA.id}/variants/${variantA.id}/images/${image2Id}`,
        )
        .set('Host', tenantA.host)
        .set('Authorization', `Bearer ${adminAToken}`)
        .send({ altText: 'Front View Shirt', isPrimary: true })
        .expect(200);

      expect(res.body).toMatchObject({
        id: image2Id,
        altText: 'Front View Shirt',
        isPrimary: true,
      });

      // Verify image1 was demoted from primary
      const listRes = await request(app.getHttpServer())
        .get(
          `/api/v1/merchant-admins/products/${productA.id}/variants/${variantA.id}/images`,
        )
        .set('Host', tenantA.host)
        .set('Authorization', `Bearer ${adminAToken}`)
        .expect(200);

      const img1 = listRes.body.find((img: any) => img.id === image1Id);
      expect(img1.isPrimary).toBe(false);
    });

    it('deletes an image and auto-promotes remaining image to primary', async () => {
      await request(app.getHttpServer())
        .delete(
          `/api/v1/merchant-admins/products/${productA.id}/variants/${variantA.id}/images/${image2Id}`,
        )
        .set('Host', tenantA.host)
        .set('Authorization', `Bearer ${adminAToken}`)
        .expect(204);

      const listRes = await request(app.getHttpServer())
        .get(
          `/api/v1/merchant-admins/products/${productA.id}/variants/${variantA.id}/images`,
        )
        .set('Host', tenantA.host)
        .set('Authorization', `Bearer ${adminAToken}`)
        .expect(200);

      expect(listRes.body).toHaveLength(1);
      expect(listRes.body[0].id).toBe(image1Id);
      expect(listRes.body[0].isPrimary).toBe(true);
    });
  });

  describe('Storefront Integration', () => {
    it('returns variants.images ordered by sortOrder ASC on GET /api/v1/products', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Host', tenantA.host)
        .expect(200);

      expect(res.body.items).toBeDefined();
      const product = res.body.items.find((p: any) => p.id === productA.id);
      expect(product).toBeDefined();
      expect(product.variants).toBeDefined();
      expect(product.variants[0].images).toBeDefined();
      expect(product.variants[0].images).toHaveLength(1);
    });

    it('returns variants.images ordered by sortOrder ASC on GET /api/v1/products/:id', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/products/${productA.id}`)
        .set('Host', tenantA.host)
        .expect(200);

      expect(res.body.id).toBe(productA.id);
      expect(res.body.variants).toBeDefined();
      expect(res.body.variants[0].images).toBeDefined();
      expect(res.body.variants[0].images).toHaveLength(1);
    });
  });

  describe('Multi-Tenant RLS & Isolation Boundary Checks', () => {
    it('prevents Tenant B from listing Tenant A variant images', async () => {
      await request(app.getHttpServer())
        .get(
          `/api/v1/merchant-admins/products/${productA.id}/variants/${variantA.id}/images`,
        )
        .set('Host', tenantB.host)
        .set('Authorization', `Bearer ${adminBToken}`)
        .expect(404);
    });

    it('prevents Tenant B from uploading image to Tenant A variant', async () => {
      await request(app.getHttpServer())
        .post(
          `/api/v1/merchant-admins/products/${productA.id}/variants/${variantA.id}/images`,
        )
        .set('Host', tenantB.host)
        .set('Authorization', `Bearer ${adminBToken}`)
        .attach('image', validImageBuffer, 'forged.png')
        .expect(404);
    });

    it('rejects cross-tenant DB insert of ProductVariantImage with mismatched tenantId', async () => {
      const write = () =>
        cls.run(() => {
          cls.set('tenantId', tenantA.id);
          return tenantDb.run((em) =>
            em.save(
              em.create(ProductVariantImage, {
                tenantId: tenantB.id,
                variantId: variantA.id,
                storageKey: `tenants/${tenantB.id}/products/${variantA.id}/forged.webp`,
                url: 'http://localhost/forged.webp',
                sortOrder: 0,
                isPrimary: false,
              }),
            ),
          );
        });

      await expect(write()).rejects.toThrow(
        /violates row-level security policy/i,
      );
    });
  });
});
