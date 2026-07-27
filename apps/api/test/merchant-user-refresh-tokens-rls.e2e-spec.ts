import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app/app.module';
import { TenantDbService } from '../src/db/tenant-db.service';
import {
  MerchantUser,
  MerchantUserRefreshToken,
  Tenant,
} from '../src/db/entities';

// The merchant-admin half of the RLS proof in
// customer-refresh-tokens-rls.e2e-spec.ts. It matters more here than for
// customers: a merchant_user row carries a `role`, so a leak across tenants is
// not just data exposure but a session that could act as an owner inside
// someone else's store.
describe('Merchant user refresh token RLS isolation (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let tenantDb: TenantDbService;
  let cls: ClsService;
  let tenantAId: string;
  let tenantBId: string;
  let merchantUserAId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = app.get(getDataSourceToken());
    tenantDb = app.get(TenantDbService);
    cls = app.get(ClsService);

    const tenantRepo = dataSource.getRepository(Tenant);
    const tenantA = await tenantRepo.save(
      tenantRepo.create({
        name: 'MU RLS Test Tenant A',
        slug: `mu-rls-test-a-${randomUUID()}`,
      }),
    );
    const tenantB = await tenantRepo.save(
      tenantRepo.create({
        name: 'MU RLS Test Tenant B',
        slug: `mu-rls-test-b-${randomUUID()}`,
      }),
    );
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    merchantUserAId = await cls.run(() => {
      cls.set('tenantId', tenantAId);
      return tenantDb.run(async (manager) => {
        const merchantUser = await manager.save(
          manager.create(MerchantUser, {
            tenantId: tenantAId,
            email: 'owner-a@example.com',
            role: 'owner',
          }),
        );
        await manager.save(
          manager.create(MerchantUserRefreshToken, {
            tenantId: tenantAId,
            merchantUserId: merchantUser.id,
            tokenHash: 'mu-test-hash-a',
            familyId: randomUUID(),
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
            revokedAt: null,
          }),
        );
        return merchantUser.id;
      });
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('is invisible when queried under a different tenant context', async () => {
    const rows = await cls.run(() => {
      cls.set('tenantId', tenantBId);
      return tenantDb.run((manager) =>
        manager.find(MerchantUserRefreshToken, {
          where: { merchantUserId: merchantUserAId },
        }),
      );
    });

    expect(rows).toHaveLength(0);
  });

  it('is visible when queried under its own tenant context', async () => {
    const rows = await cls.run(() => {
      cls.set('tenantId', tenantAId);
      return tenantDb.run((manager) =>
        manager.find(MerchantUserRefreshToken, {
          where: { merchantUserId: merchantUserAId },
        }),
      );
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toEqual('mu-test-hash-a');
  });

  it('hides the owning merchant_users row from another tenant too', async () => {
    const rows = await cls.run(() => {
      cls.set('tenantId', tenantBId);
      return tenantDb.run((manager) =>
        manager.find(MerchantUser, { where: { id: merchantUserAId } }),
      );
    });

    expect(rows).toHaveLength(0);
  });

  it('rejects a cross-tenant write instead of silently accepting it', async () => {
    const attemptedWrite = () =>
      cls.run(() => {
        cls.set('tenantId', tenantAId);
        return tenantDb.run((manager) =>
          manager.save(
            manager.create(MerchantUserRefreshToken, {
              tenantId: tenantBId,
              merchantUserId: merchantUserAId,
              tokenHash: `mu-forged-hash-${randomUUID()}`,
              familyId: randomUUID(),
              expiresAt: new Date(Date.now() + 60 * 60 * 1000),
              revokedAt: null,
            }),
          ),
        );
      });

    await expect(attemptedWrite()).rejects.toThrow(
      /violates row-level security policy/i,
    );
  });
});
