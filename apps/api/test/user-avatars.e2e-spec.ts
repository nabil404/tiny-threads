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
import { Tenant, MerchantUser, Customer } from '../src/db/entities';

describe('User Avatars E2E & Multi-Tenant Isolation', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let tenantDb: TenantDbService;
  let cls: ClsService;
  let tokenService: TokenService;

  let tenantA: Tenant;
  let tenantB: Tenant;

  let merchantAdminA: MerchantUser;
  let merchantAdminB: MerchantUser;
  let merchantAdminAToken: string;
  let merchantAdminBToken: string;

  let customerA: Customer;
  let customerB: Customer;
  let customerAToken: string;
  let customerBToken: string;

  let validAvatarBuffer: Buffer;

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

    validAvatarBuffer = await sharp({
      create: {
        width: 400,
        height: 400,
        channels: 4,
        background: { r: 0, g: 128, b: 255, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const tenantRepo = dataSource.getRepository(Tenant);
    tenantA = await tenantRepo.save(
      tenantRepo.create({
        name: 'Avatars Tenant A',
        host: `avatars-a-${randomUUID()}.localhost`,
      }),
    );
    tenantB = await tenantRepo.save(
      tenantRepo.create({
        name: 'Avatars Tenant B',
        host: `avatars-b-${randomUUID()}.localhost`,
      }),
    );

    // Seed Merchant Admin A & Customer A in Tenant A context
    await cls.run(() => {
      cls.set('tenantId', tenantA.id);
      return tenantDb.run(async (em) => {
        merchantAdminA = await em.save(
          em.create(MerchantUser, {
            tenantId: tenantA.id,
            email: `madmin-a-${randomUUID()}@example.com`,
            role: 'owner',
          }),
        );
        customerA = await em.save(
          em.create(Customer, {
            tenantId: tenantA.id,
            email: `cust-a-${randomUUID()}@example.com`,
            name: 'Customer A',
          }),
        );
      });
    });

    merchantAdminAToken = tokenService.signAccessToken({
      sub: merchantAdminA.id,
      aud: 'merchant_admin',
      tenantId: tenantA.id,
      role: 'owner',
    });
    customerAToken = tokenService.signAccessToken({
      sub: customerA.id,
      aud: 'customer',
      tenantId: tenantA.id,
    });

    // Seed Merchant Admin B & Customer B in Tenant B context
    await cls.run(() => {
      cls.set('tenantId', tenantB.id);
      return tenantDb.run(async (em) => {
        merchantAdminB = await em.save(
          em.create(MerchantUser, {
            tenantId: tenantB.id,
            email: `madmin-b-${randomUUID()}@example.com`,
            role: 'owner',
          }),
        );
        customerB = await em.save(
          em.create(Customer, {
            tenantId: tenantB.id,
            email: `cust-b-${randomUUID()}@example.com`,
            name: 'Customer B',
          }),
        );
      });
    });

    merchantAdminBToken = tokenService.signAccessToken({
      sub: merchantAdminB.id,
      aud: 'merchant_admin',
      tenantId: tenantB.id,
      role: 'owner',
    });
    customerBToken = tokenService.signAccessToken({
      sub: customerB.id,
      aud: 'customer',
      tenantId: tenantB.id,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Merchant Admin Avatar', () => {
    it('uploads and updates merchant admin avatar', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/merchant-admins/me/avatar')
        .set('Host', tenantA.host)
        .set('Authorization', `Bearer ${merchantAdminAToken}`)
        .attach('avatar', validAvatarBuffer, 'admin-avatar.png')
        .expect(201);

      expect(res.body.avatarUrl).toBeDefined();
      expect(res.body.avatarUrl).toContain('http://localhost:8000/uploads/');

      // Verify static image is publicly accessible via HTTP GET
      const avatarPath = new URL(res.body.avatarUrl).pathname;
      await request(app.getHttpServer())
        .get(avatarPath)
        .set('Host', tenantA.host)
        .expect(200);

      // Verify DB record updated
      const updatedAdmin = await cls.run(() => {
        cls.set('tenantId', tenantA.id);
        return tenantDb.run((em) =>
          em.findOne(MerchantUser, { where: { id: merchantAdminA.id } }),
        );
      });
      expect(updatedAdmin?.avatarUrl).toEqual(res.body.avatarUrl);
    });

    it('deletes merchant admin avatar', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/merchant-admins/me/avatar')
        .set('Host', tenantA.host)
        .set('Authorization', `Bearer ${merchantAdminAToken}`)
        .expect(204);

      // Verify DB record cleared
      const updatedAdmin = await cls.run(() => {
        cls.set('tenantId', tenantA.id);
        return tenantDb.run((em) =>
          em.findOne(MerchantUser, { where: { id: merchantAdminA.id } }),
        );
      });
      expect(updatedAdmin?.avatarUrl).toBeNull();
    });
  });

  describe('Customer Avatar', () => {
    it('uploads and updates customer avatar', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/customers/me/avatar')
        .set('Host', tenantA.host)
        .set('Authorization', `Bearer ${customerAToken}`)
        .attach('avatar', validAvatarBuffer, 'customer-avatar.png')
        .expect(201);

      expect(res.body.avatarUrl).toBeDefined();

      // Verify DB record updated
      const updatedCust = await cls.run(() => {
        cls.set('tenantId', tenantA.id);
        return tenantDb.run((em) =>
          em.findOne(Customer, { where: { id: customerA.id } }),
        );
      });
      expect(updatedCust?.avatarUrl).toEqual(res.body.avatarUrl);
    });

    it('deletes customer avatar', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/customers/me/avatar')
        .set('Host', tenantA.host)
        .set('Authorization', `Bearer ${customerAToken}`)
        .expect(204);

      // Verify DB record cleared
      const updatedCust = await cls.run(() => {
        cls.set('tenantId', tenantA.id);
        return tenantDb.run((em) =>
          em.findOne(Customer, { where: { id: customerA.id } }),
        );
      });
      expect(updatedCust?.avatarUrl).toBeNull();
    });
  });

  describe('Error Handling & Multi-Tenant Security', () => {
    it('returns INVALID_FILE_TYPE error when non-image binary is uploaded', async () => {
      const badBuffer = Buffer.from('PLAIN TEXT NOT AN IMAGE');

      const res = await request(app.getHttpServer())
        .post('/api/v1/customers/me/avatar')
        .set('Host', tenantA.host)
        .set('Authorization', `Bearer ${customerAToken}`)
        .attach('avatar', badBuffer, 'invalid.txt')
        .expect(400);

      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toEqual('INVALID_FILE_TYPE');
    });

    it('rejects cross-tenant token mismatch (Tenant B user token on Tenant A host)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/merchant-admins/me/avatar')
        .set('Host', tenantA.host)
        .set('Authorization', `Bearer ${merchantAdminBToken}`)
        .attach('avatar', validAvatarBuffer, 'admin-avatar.png')
        .expect(401);
    });

    it('rejects cross-tenant customer token mismatch (Tenant B customer token on Tenant A host)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/customers/me/avatar')
        .set('Host', tenantA.host)
        .set('Authorization', `Bearer ${customerBToken}`)
        .attach('avatar', validAvatarBuffer, 'customer-avatar.png')
        .expect(401);
    });
  });
});
