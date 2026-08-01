import request from 'supertest';
import { DataSource } from 'typeorm';
import { setupE2eTestModule } from './utils/e2e-test-setup';

describe('Payments Webhook (E2E)', () => {
  let app: any;

  beforeAll(async () => {
    const fixture = await setupE2eTestModule();
    app = fixture.app;
    const dataSource = app.get(DataSource);
    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    const hash = require('crypto')
      .createHash('md5')
      .update('acct-mock-tenant')
      .digest('hex');
    const tenantId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    await qr.query(`SELECT set_config('app.current_tenant', $1, true)`, [
      tenantId,
    ]);
    await qr.query(
      `DELETE FROM order_events WHERE provider_event_id = 'evt-unique-101'`,
    );
    await qr.commitTransaction();
    await qr.release();
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
