import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app/app.module';
import { Tenant } from '../src/db/entities';
import { configureApp } from '../src/bootstrap';

describe('Customers auth error envelope (e2e)', () => {
  let app: INestApplication;
  let tenantHost: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    const dataSource = app.get<DataSource>(getDataSourceToken());
    tenantHost = `error-format-customers-${randomUUID()}.localhost`;
    await dataSource.getRepository(Tenant).save(
      dataSource.getRepository(Tenant).create({
        name: 'Error Format Test Tenant',
        host: tenantHost,
      }),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns a VALIDATION_FAILED envelope with a decoded fields map for a short password', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/customers/auth/register')
      .set('Host', tenantHost)
      .send({ email: 'jane@example.com', password: 'short', name: 'Jane' })
      .expect(400);

    expect(response.body).toMatchObject({
      error: {
        code: 'VALIDATION_FAILED',
        fields: {
          password: [
            expect.objectContaining({
              code: 'MIN_LENGTH',
              params: { min: 12 },
            }),
          ],
        },
      },
    });
  });

  it('returns an AUTH_INVALID_CREDENTIALS envelope for a login with a wrong password', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/customers/auth/register')
      .set('Host', tenantHost)
      .send({
        email: 'wrong-password@example.com',
        password: 'correct horse battery staple',
        name: 'Wrong Password',
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/api/v1/customers/auth/login')
      .set('Host', tenantHost)
      .send({
        email: 'wrong-password@example.com',
        password: 'not the right password',
      })
      .expect(401);

    expect(response.body).toEqual({
      error: {
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Invalid email or password',
        params: {},
      },
    });
  });
});
