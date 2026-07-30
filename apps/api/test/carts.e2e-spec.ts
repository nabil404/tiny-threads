import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app/app.module';
import { configureApp } from '../src/bootstrap';
import { TenantDbService } from '../src/db/tenant-db.service';
import { Tenant, Product, ProductVariant } from '../src/db/entities';

describe('Carts (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let tenantHost: string;
  let variantId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    dataSource = app.get<DataSource>(getDataSourceToken());
    const tenantDb = app.get(TenantDbService);
    const cls = app.get(ClsService);

    tenantHost = `carts-e2e-${randomUUID()}.localhost`;
    const tenant = await dataSource.getRepository(Tenant).save(
      dataSource.getRepository(Tenant).create({
        name: 'Carts E2E Test Tenant',
        host: tenantHost,
      }),
    );

    // Products/variants are tenant-scoped tables enforced by RLS, so seeding
    // them (unlike the global Tenant row above) must go through
    // TenantDbService under this tenant's CLS context — a bare
    // dataSource.getRepository() insert has no tenant context set and gets
    // rejected by the RLS WITH CHECK policy.
    variantId = await cls.run(() => {
      cls.set('tenantId', tenant.id);
      return tenantDb.run(async (manager) => {
        const product = await manager.save(
          manager.create(Product, {
            tenantId: tenant.id,
            title: 'Cart Test Shirt',
            status: 'active',
          }),
        );

        const variant = await manager.save(
          manager.create(ProductVariant, {
            tenantId: tenant.id,
            productId: product.id,
            sku: `CART-TEST-${randomUUID()}`,
            priceCents: 1500,
            stock: 100,
            isDefault: true,
          }),
        );
        return variant.id;
      });
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/cart - generates a guest session ID and returns an empty cart', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Host', tenantHost)
      .expect(200);

    expect(res.headers['x-guest-session-id']).toBeDefined();
    expect(res.body.itemCount).toEqual(0);
    expect(res.body.subtotalCents).toEqual(0);
    expect(res.body.items).toEqual([]);
  });

  it('POST /api/v1/cart/items - adds an item to a guest cart and returns the updated cart, not a stale empty one', async () => {
    const getRes = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Host', tenantHost)
      .expect(200);
    const guestSessionId = getRes.headers['x-guest-session-id'];

    const addRes = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Host', tenantHost)
      .set('x-guest-session-id', guestSessionId)
      .send({ variantId, qty: 2 })
      .expect(201);

    expect(addRes.body.itemCount).toEqual(2);
    expect(addRes.body.subtotalCents).toEqual(3000);
    expect(addRes.body.items).toHaveLength(1);
    expect(addRes.body.items[0]).toMatchObject({
      variantId,
      qty: 2,
      priceCents: 1500,
      lineTotalCents: 3000,
    });

    // Confirm it's genuinely persisted, not just an in-memory echo: fetching
    // the cart again with the same session should show the same item.
    const refetch = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Host', tenantHost)
      .set('x-guest-session-id', guestSessionId)
      .expect(200);
    expect(refetch.body.itemCount).toEqual(2);
    expect(refetch.body.items).toHaveLength(1);
  });

  it('POST /api/v1/cart/items - generates its own guest session ID when none is supplied', async () => {
    const addRes = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Host', tenantHost)
      .send({ variantId, qty: 1 })
      .expect(201);

    expect(addRes.headers['x-guest-session-id']).toBeDefined();
    expect(addRes.body.itemCount).toEqual(1);
    expect(addRes.body.items).toHaveLength(1);
  });

  it('PATCH /api/v1/cart/items/:id and DELETE /api/v1/cart/items/:id update and remove a guest cart item', async () => {
    const getRes = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Host', tenantHost)
      .expect(200);
    const guestSessionId = getRes.headers['x-guest-session-id'];

    const addRes = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Host', tenantHost)
      .set('x-guest-session-id', guestSessionId)
      .send({ variantId, qty: 1 })
      .expect(201);
    const itemId = addRes.body.items[0].id as string;

    const patchRes = await request(app.getHttpServer())
      .patch(`/api/v1/cart/items/${itemId}`)
      .set('Host', tenantHost)
      .set('x-guest-session-id', guestSessionId)
      .send({ qty: 5 })
      .expect(200);
    expect(patchRes.body.itemCount).toEqual(5);
    expect(patchRes.body.items[0].qty).toEqual(5);

    const deleteRes = await request(app.getHttpServer())
      .delete(`/api/v1/cart/items/${itemId}`)
      .set('Host', tenantHost)
      .set('x-guest-session-id', guestSessionId)
      .expect(200);
    expect(deleteRes.body.itemCount).toEqual(0);
    expect(deleteRes.body.items).toEqual([]);
  });

  it('POST /api/v1/cart/merge - merges a guest cart into the authenticated customer cart', async () => {
    const email = `cart-merge-${randomUUID()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/customers/auth/register')
      .set('Host', tenantHost)
      .send({
        email,
        password: 'correct horse battery staple',
        name: 'Cart Merge Customer',
      })
      .expect(201);

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/customers/auth/login')
      .set('Host', tenantHost)
      .send({ email, password: 'correct horse battery staple' })
      .expect(201);
    const accessToken = loginRes.body.accessToken as string;

    const getRes = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Host', tenantHost)
      .expect(200);
    const guestSessionId = getRes.headers['x-guest-session-id'];

    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Host', tenantHost)
      .set('x-guest-session-id', guestSessionId)
      .send({ variantId, qty: 3 })
      .expect(201);

    const mergeRes = await request(app.getHttpServer())
      .post('/api/v1/cart/merge')
      .set('Host', tenantHost)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ guestSessionId })
      .expect(201);

    expect(mergeRes.body.itemCount).toEqual(3);
    expect(mergeRes.body.items).toHaveLength(1);
    expect(mergeRes.body.items[0]).toMatchObject({ variantId, qty: 3 });

    // The customer's cart, fetched again with the bearer token, must show
    // the merged item — proving the merge landed on the customer's cart and
    // not just in the merge response body.
    const customerCartRes = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Host', tenantHost)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(customerCartRes.body.itemCount).toEqual(3);
  });
});
