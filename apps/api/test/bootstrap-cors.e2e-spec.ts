import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app/app.module';
import { configureApp } from '../src/bootstrap';

describe('CORS configuration (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  it('allows credentialed cross-origin requests from the configured admin-web origin', async () => {
    const origin = process.env.ADMIN_WEB_ORIGIN ?? 'http://localhost:3000';

    const response = await request(app.getHttpServer())
      .get('/')
      .set('Origin', origin);

    expect(response.headers['access-control-allow-origin']).toBe(origin);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  afterEach(async () => {
    await app.close();
  });
});
