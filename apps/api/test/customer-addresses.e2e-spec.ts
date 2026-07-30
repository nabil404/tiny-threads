import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app/app.module';
import { configureApp } from '../src/bootstrap';
import { Tenant, Country } from '../src/db/entities';

describe('Customer addresses (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let tenantHost: string;
  let accessToken: string;

  const baseAddress = {
    firstName: 'Jane',
    lastName: 'Doe',
    line1: '123 Main St',
    city: 'Springfield',
    postalCode: '12345',
    countryCode: 'US',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    dataSource = app.get<DataSource>(getDataSourceToken());
    tenantHost = `customer-addresses-e2e-${randomUUID()}.localhost`;
    await dataSource.getRepository(Tenant).save(
      dataSource.getRepository(Tenant).create({
        name: 'Customer Addresses E2E Test Tenant',
        host: tenantHost,
      }),
    );

    // Countries is a global reference table with no seed migration — an
    // address create/update against an unknown code always 404s unless the
    // code exists here first.
    const countryRepo = dataSource.getRepository(Country);
    const existing = await countryRepo.findOneBy({ code: 'US' });
    if (!existing) {
      await countryRepo.save(
        countryRepo.create({ code: 'US', name: 'United States' }),
      );
    }

    const email = `addresses-${randomUUID()}@example.com`;
    await request(app.getHttpServer())
      .post('/api/v1/customers/auth/register')
      .set('Host', tenantHost)
      .send({
        email,
        password: 'correct horse battery staple',
        name: 'Address Test Customer',
      })
      .expect(201);

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/customers/auth/login')
      .set('Host', tenantHost)
      .send({ email, password: 'correct horse battery staple' })
      .expect(201);
    accessToken = loginRes.body.accessToken as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it('runs the full CRUD flow: create, list, get, update, set default, delete', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/customers/me/addresses')
      .set('Host', tenantHost)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(baseAddress)
      .expect(201);

    expect(createRes.body).toMatchObject({
      firstName: 'Jane',
      lastName: 'Doe',
      city: 'Springfield',
      countryCode: 'US',
    });
    const addressId = createRes.body.id as string;

    const listRes = await request(app.getHttpServer())
      .get('/api/v1/customers/me/addresses')
      .set('Host', tenantHost)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].id).toEqual(addressId);

    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/customers/me/addresses/${addressId}`)
      .set('Host', tenantHost)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(getRes.body.id).toEqual(addressId);

    const updateRes = await request(app.getHttpServer())
      .patch(`/api/v1/customers/me/addresses/${addressId}`)
      .set('Host', tenantHost)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ city: 'Shelbyville' })
      .expect(200);
    expect(updateRes.body.city).toEqual('Shelbyville');

    const defaultRes = await request(app.getHttpServer())
      .post(`/api/v1/customers/me/addresses/${addressId}/default`)
      .set('Host', tenantHost)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ defaultShipping: true, defaultBilling: true })
      .expect(201);
    expect(defaultRes.body.isDefaultShipping).toEqual(true);
    expect(defaultRes.body.isDefaultBilling).toEqual(true);

    await request(app.getHttpServer())
      .delete(`/api/v1/customers/me/addresses/${addressId}`)
      .set('Host', tenantHost)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const listAfterDeleteRes = await request(app.getHttpServer())
      .get('/api/v1/customers/me/addresses')
      .set('Host', tenantHost)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(listAfterDeleteRes.body).toEqual([]);
  });

  it('rejects requests without a bearer token', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/customers/me/addresses')
      .set('Host', tenantHost)
      .expect(401);
  });

  it('returns INVALID_COUNTRY_CODE for an unknown country code', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/customers/me/addresses')
      .set('Host', tenantHost)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ...baseAddress, countryCode: 'ZZ' })
      .expect(404);

    expect(res.body).toMatchObject({
      error: {
        code: 'INVALID_COUNTRY_CODE',
      },
    });
  });
});
