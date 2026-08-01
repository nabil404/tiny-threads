import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app/app.module';
import { configureApp } from '../src/bootstrap';
import { TenantDbService } from '../src/db/tenant-db.service';
import { TokenService } from '../src/auth-core/services/token.service';
import {
  Tenant,
  Product,
  ProductVariant,
  Order,
  Customer,
  MerchantUser,
} from '../src/db/entities';

describe('Orders (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let tenantDb: TenantDbService;
  let cls: ClsService;
  let tokenService: TokenService;

  let tenantId: string;
  let tenantHost: string;
  let variantId: string;

  let customerId: string;
  let customerToken: string;

  let adminId: string;
  let adminToken: string;

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

    tenantHost = `orders-e2e-${randomUUID()}.localhost`;
    const tenant = await dataSource.getRepository(Tenant).save(
      dataSource.getRepository(Tenant).create({
        name: 'Orders E2E Test Tenant',
        host: tenantHost,
      }),
    );
    tenantId = tenant.id;

    await cls.run(async () => {
      cls.set('tenantId', tenantId);
      await tenantDb.run(async (manager) => {
        // Create product & variant
        const product = await manager.save(
          manager.create(Product, {
            tenantId,
            title: 'Order Test T-Shirt',
            status: 'active',
          }),
        );

        const variant = await manager.save(
          manager.create(ProductVariant, {
            tenantId,
            productId: product.id,
            sku: `ORDER-SKU-${randomUUID()}`,
            priceCents: 2000,
            stock: 50,
            isDefault: true,
          }),
        );
        variantId = variant.id;

        // Create customer
        const customer = await manager.save(
          manager.create(Customer, {
            tenantId,
            email: `customer-${randomUUID()}@example.com`,
            name: 'Test Customer',
          }),
        );
        customerId = customer.id;

        // Create merchant admin
        const admin = await manager.save(
          manager.create(MerchantUser, {
            tenantId,
            email: `admin-${randomUUID()}@example.com`,
            role: 'owner',
          }),
        );
        adminId = admin.id;
      });
    });

    customerToken = tokenService.signAccessToken({
      sub: customerId,
      aud: 'customer',
      tenantId,
    });

    adminToken = tokenService.signAccessToken({
      sub: adminId,
      aud: 'merchant_admin',
      tenantId,
      role: 'owner',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  let guestOrderId: string;
  let guestAccessToken: string;

  it('1. Guest Checkout & Guest Order Lookup', async () => {
    // 1a. Create cart for guest
    const cartRes = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Host', tenantHost)
      .expect(200);

    const sessionId = cartRes.headers['x-guest-session-id'] as string;

    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Host', tenantHost)
      .set('x-guest-session-id', sessionId)
      .send({ variantId, qty: 2 })
      .expect(201);

    // 1b. Checkout guest cart. Cart identity is derived from the
    // x-guest-session-id header (not a client-supplied cartId — see R4).
    const checkoutRes = await request(app.getHttpServer())
      .post('/api/v1/checkout')
      .set('Host', tenantHost)
      .set('x-guest-session-id', sessionId)
      .send({
        customerEmail: 'guest@example.com',
        shippingAddress: { street: '123 Main St', city: 'City', country: 'US' },
        paymentToken: 'mock_success',
      })
      .expect(201);

    guestOrderId = checkoutRes.body.order.id;
    guestAccessToken = checkoutRes.body.guestAccessToken;
    expect(guestAccessToken).toBeDefined();

    // 1c. Guest lookup with valid token
    const guestLookupRes = await request(app.getHttpServer())
      .get(`/api/v1/guest/orders/${guestOrderId}?token=${guestAccessToken}`)
      .set('Host', tenantHost)
      .expect(200);

    expect(guestLookupRes.body.id).toBe(guestOrderId);
    expect(guestLookupRes.body.customerEmail).toBe('guest@example.com');
    expect(guestLookupRes.body.items).toHaveLength(1);

    // 1d. Guest lookup with invalid token -> 404
    await request(app.getHttpServer())
      .get(`/api/v1/guest/orders/${guestOrderId}?token=invalid-token`)
      .set('Host', tenantHost)
      .expect(404);
  });

  let customerOrderId: string;

  it('2. Customer Order, List, Detail & Cancel', async () => {
    // Create an order directly in DB in pending_payment for cancellation testing
    customerOrderId = await cls.run(async () => {
      cls.set('tenantId', tenantId);
      return tenantDb.run(async (manager) => {
        const order = await manager.save(
          manager.create(Order, {
            tenantId,
            customerId,
            customerEmail: 'customer@example.com',
            status: 'pending_payment',
            paymentStatus: 'pending',
            currencyCode: 'USD',
            totalCents: 2000,
            shippingAddress: { street: '456 Oak St' },
          }),
        );
        return order.id;
      });
    });

    // 2a. Get customer orders
    const listRes = await request(app.getHttpServer())
      .get('/api/v1/customers/orders')
      .set('Host', tenantHost)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.some((o: any) => o.id === customerOrderId)).toBe(true);

    // 2b. Get customer order by ID
    const detailRes = await request(app.getHttpServer())
      .get(`/api/v1/customers/orders/${customerOrderId}`)
      .set('Host', tenantHost)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    expect(detailRes.body.id).toBe(customerOrderId);

    // 2c. Cancel customer order
    const cancelRes = await request(app.getHttpServer())
      .post(`/api/v1/customers/orders/${customerOrderId}/cancel`)
      .set('Host', tenantHost)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(201);

    expect(cancelRes.body.status).toBe('cancelled');

    // 2d. Cancel order again -> 400 ORDER_CANNOT_BE_CANCELLED
    await request(app.getHttpServer())
      .post(`/api/v1/customers/orders/${customerOrderId}/cancel`)
      .set('Host', tenantHost)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(400);
  });

  it('3. Merchant Admin Orders, Status Transitions & Refunds', async () => {
    // 3a. List merchant orders
    const listRes = await request(app.getHttpServer())
      .get('/api/v1/merchant-admins/orders')
      .set('Host', tenantHost)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.length).toBeGreaterThan(0);

    // 3b. Get merchant order by ID
    const detailRes = await request(app.getHttpServer())
      .get(`/api/v1/merchant-admins/orders/${guestOrderId}`)
      .set('Host', tenantHost)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(detailRes.body.id).toBe(guestOrderId);
    expect(detailRes.body.status).toBe('paid');

    // 3c. Transition status paid -> processing
    const status1Res = await request(app.getHttpServer())
      .patch(`/api/v1/merchant-admins/orders/${guestOrderId}/status`)
      .set('Host', tenantHost)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'processing' })
      .expect(200);

    expect(status1Res.body.status).toBe('processing');

    // 3d. Transition status processing -> shipped
    const status2Res = await request(app.getHttpServer())
      .patch(`/api/v1/merchant-admins/orders/${guestOrderId}/status`)
      .set('Host', tenantHost)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'shipped' })
      .expect(200);

    expect(status2Res.body.status).toBe('shipped');

    // 3e. Refund order (partial refund)
    const refundRes = await request(app.getHttpServer())
      .post(`/api/v1/merchant-admins/orders/${guestOrderId}/refund`)
      .set('Host', tenantHost)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ amountCents: 1000, reason: 'Returned one item' })
      .expect(201);

    expect(refundRes.body.amountCents).toBe(1000);

    // Check order paymentStatus updated to partially_refunded
    const checkOrderRes = await request(app.getHttpServer())
      .get(`/api/v1/merchant-admins/orders/${guestOrderId}`)
      .set('Host', tenantHost)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(checkOrderRes.body.paymentStatus).toBe('partially_refunded');
  });
});
