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
import { Tenant, Product, ProductVariant, Cart } from '../src/db/entities';

describe('Carts (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let tenantDb: TenantDbService;
  let cls: ClsService;
  let tenantId: string;
  let tenantHost: string;
  let variantId: string;

  // carts is RLS-protected, so a bare dataSource query would return 0 rows
  // regardless — counting has to happen inside this tenant's context to mean
  // anything.
  const countCartsForSession = (sessionId: string): Promise<number> =>
    cls.run(() => {
      cls.set('tenantId', tenantId);
      return tenantDb.run((manager) =>
        manager.count(Cart, { where: { sessionId } }),
      );
    });

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

    tenantHost = `carts-e2e-${randomUUID()}.localhost`;
    const tenant = await dataSource.getRepository(Tenant).save(
      dataSource.getRepository(Tenant).create({
        name: 'Carts E2E Test Tenant',
        host: tenantHost,
      }),
    );
    tenantId = tenant.id;

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

  // Regression for the cross-account cart leak: real clients keep sending
  // x-guest-session-id after login. If that id gets stamped onto the
  // customer's cart row, an anonymous request carrying only that header finds
  // and fully controls the logged-in customer's cart.
  it("POST /api/v1/cart/merge - a stale guest session ID must not grant anonymous access to the customer's cart", async () => {
    const email = `cart-leak-${randomUUID()}@example.com`;
    const password = 'correct horse battery staple';
    await request(app.getHttpServer())
      .post('/api/v1/customers/auth/register')
      .set('Host', tenantHost)
      .send({ email, password, name: 'Cart Leak Customer' })
      .expect(201);

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/customers/auth/login')
      .set('Host', tenantHost)
      .send({ email, password })
      .expect(201);
    const accessToken = loginRes.body.accessToken as string;

    // 1. Guest gets session S and adds 1 item.
    const guestRes = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Host', tenantHost)
      .expect(200);
    const guestSessionId = guestRes.headers['x-guest-session-id'];
    const guestCartId = guestRes.body.id as string;

    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Host', tenantHost)
      .set('x-guest-session-id', guestSessionId)
      .send({ variantId, qty: 1 })
      .expect(201);

    // 2. Customer logs in but the client keeps sending S alongside the token.
    //    The customer's cart must NOT pick up that session id.
    const customerAddRes = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Host', tenantHost)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-guest-session-id', guestSessionId)
      .send({ variantId, qty: 7 })
      .expect(201);
    const customerCartId = customerAddRes.body.id as string;
    expect(customerCartId).not.toEqual(guestCartId);
    expect(customerAddRes.body.itemCount).toEqual(7);

    // Only the guest's own cart carries that session id — the customer's cart
    // row must have session_id NULL.
    expect(await countCartsForSession(guestSessionId)).toEqual(1);

    // 3. Merge the guest cart in: customer now has 8, guest cart is abandoned.
    const mergeRes = await request(app.getHttpServer())
      .post('/api/v1/cart/merge')
      .set('Host', tenantHost)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ guestSessionId })
      .expect(201);
    expect(mergeRes.body.id).toEqual(customerCartId);
    expect(mergeRes.body.itemCount).toEqual(8);

    // 4. The attack: anonymous request with ONLY the old session header.
    //    It must get a brand-new empty guest cart, never the customer's.
    const anonRes = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Host', tenantHost)
      .set('x-guest-session-id', guestSessionId)
      .expect(200);
    expect(anonRes.body.id).not.toEqual(customerCartId);
    expect(anonRes.body.id).not.toEqual(guestCartId);
    expect(anonRes.body.itemCount).toEqual(0);
    expect(anonRes.body.items).toEqual([]);

    // And the customer's cart is untouched by all of the above.
    const customerCartRes = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Host', tenantHost)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(customerCartRes.body.id).toEqual(customerCartId);
    expect(customerCartRes.body.itemCount).toEqual(8);
  });

  it('rejects a malformed x-guest-session-id header with 400 VALIDATION_FAILED', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Host', tenantHost)
      .set('x-guest-session-id', 'not-a-uuid')
      .expect(400);

    expect(res.body.error.code).toEqual('VALIDATION_FAILED');
  });

  it('returns a VALIDATION_FAILED envelope with field error codes for invalid add-to-cart body payload', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Host', tenantHost)
      .send({ variantId: 'not-a-uuid', qty: -5 })
      .expect(400);

    expect(res.body).toMatchObject({
      error: {
        code: 'VALIDATION_FAILED',
        fields: {
          variantId: [
            expect.objectContaining({
              code: 'IS_UUID',
            }),
          ],
          qty: [
            expect.objectContaining({
              code: 'MIN',
            }),
          ],
        },
      },
    });
  });

  it('PATCH/DELETE /api/v1/cart/items/:id - do not create a cart for an unseen session', async () => {
    const unseenSessionId = randomUUID();

    const patchRes = await request(app.getHttpServer())
      .patch(`/api/v1/cart/items/${randomUUID()}`)
      .set('Host', tenantHost)
      .set('x-guest-session-id', unseenSessionId)
      .send({ qty: 3 })
      .expect(404);
    expect(patchRes.body.error.code).toEqual('CART_NOT_FOUND');

    const deleteRes = await request(app.getHttpServer())
      .delete(`/api/v1/cart/items/${randomUUID()}`)
      .set('Host', tenantHost)
      .set('x-guest-session-id', unseenSessionId)
      .expect(404);
    expect(deleteRes.body.error.code).toEqual('CART_NOT_FOUND');

    // Nothing was inserted for that session — the whole point of the fix is
    // that an unseen, attacker-chosen session id can't spawn rows here.
    expect(await countCartsForSession(unseenSessionId)).toEqual(0);
  });
});
