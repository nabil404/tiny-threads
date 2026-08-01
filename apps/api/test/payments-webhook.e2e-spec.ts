import { randomUUID } from 'crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { setupE2eTestModule } from './utils/e2e-test-setup';
import { Tenant, PaymentProviderConfig } from '../src/db/entities';

describe('Payments Webhook (E2E)', () => {
  let app: any;
  let dataSource: DataSource;
  let tenantId: string;

  beforeAll(async () => {
    const fixture = await setupE2eTestModule();
    app = fixture.app;
    dataSource = app.get<DataSource>(DataSource);

    // Clean up test rows if they exist from a previous run
    await dataSource.transaction(async (manager) => {
      await manager.query(`select set_config('app.bypass_rls', 'true', true)`);
      await manager.query(
        `DELETE FROM order_events WHERE provider_event_id = 'evt-unique-101'`,
      );
      await manager.query(
        `DELETE FROM payment_provider_configs WHERE account_ref = 'acct-mock-tenant'`,
      );
    });

    // Create a real test tenant
    const tenant = await dataSource.getRepository(Tenant).save(
      dataSource.getRepository(Tenant).create({
        name: 'Webhook Test Tenant',
        host: `webhook-test-${randomUUID()}.localhost`,
      }),
    );
    tenantId = tenant.id;

    // Ensure payment_providers row exists
    await dataSource.query(`
      INSERT INTO payment_providers (code, name, supports_split)
      VALUES ('mock', 'Mock Provider', true)
      ON CONFLICT (code) DO NOTHING;
    `);

    // Create PaymentProviderConfig mapping 'acct-mock-tenant' to tenantId
    await dataSource.transaction(async (manager) => {
      await manager.query(`select set_config('app.current_tenant', $1, true)`, [
        tenantId,
      ]);
      await manager.save(
        manager.create(PaymentProviderConfig, {
          tenantId,
          providerCode: 'mock',
          accountRef: 'acct-mock-tenant',
          enabled: true,
        }),
      );
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('processes webhook and handles duplicate replay idempotently', async () => {
    const payload = JSON.stringify({
      id: 'evt-unique-101',
      type: 'payment.captured',
      merchantAccountId: 'acct-mock-tenant',
    });

    const res1 = await request(app.getHttpServer())
      .post('/api/v1/payments/webhook')
      .set('x-mock-signature', 'test-sig')
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res1.status).toBe(200);
    expect(res1.body).toEqual({ received: true, status: 'processed' });

    // Replay exact same webhook
    const res2 = await request(app.getHttpServer())
      .post('/api/v1/payments/webhook')
      .set('x-mock-signature', 'test-sig')
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res2.status).toBe(200);
    expect(res2.body).toEqual({ received: true, status: 'already_processed' });
  });
});
