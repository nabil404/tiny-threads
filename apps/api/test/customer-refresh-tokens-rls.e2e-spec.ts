import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app/app.module';
import { TenantDbService } from '../src/db/tenant-db.service';
import { Customer, CustomerRefreshToken, Tenant } from '../src/db/entities';

describe('Customer refresh token RLS isolation (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let tenantDb: TenantDbService;
  let cls: ClsService;
  let tenantAId: string;
  let tenantBId: string;
  let customerAId: string;

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
        name: 'RLS Test Tenant A',
        host: `rls-test-a-${randomUUID()}.localhost`,
      }),
    );
    const tenantB = await tenantRepo.save(
      tenantRepo.create({
        name: 'RLS Test Tenant B',
        host: `rls-test-b-${randomUUID()}.localhost`,
      }),
    );
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    customerAId = await cls.run(() => {
      cls.set('tenantId', tenantAId);
      return tenantDb.run(async (manager) => {
        const customer = await manager.save(
          manager.create(Customer, {
            tenantId: tenantAId,
            email: 'a@example.com',
            name: 'Customer A',
          }),
        );
        await manager.save(
          manager.create(CustomerRefreshToken, {
            tenantId: tenantAId,
            customerId: customer.id,
            tokenHash: 'test-hash-a',
            familyId: randomUUID(),
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
            revokedAt: null,
          }),
        );
        return customer.id;
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
        manager.find(CustomerRefreshToken, {
          where: { customerId: customerAId },
        }),
      );
    });

    expect(rows).toHaveLength(0);
  });

  it('is visible when queried under its own tenant context', async () => {
    const rows = await cls.run(() => {
      cls.set('tenantId', tenantAId);
      return tenantDb.run((manager) =>
        manager.find(CustomerRefreshToken, {
          where: { customerId: customerAId },
        }),
      );
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toEqual('test-hash-a');
  });

  // The read path above proves the USING half of the tenant_isolation policy.
  // The WITH CHECK half — which stops a session from writing rows stamped with
  // someone else's tenant_id — is the half application code can't substitute
  // for, and it had no coverage. A tenant-A session must not be able to plant a
  // refresh token that claims to belong to tenant B (that would be a forged
  // credential inside another tenant's data).
  it('rejects a cross-tenant write instead of silently accepting it', async () => {
    const attemptedWrite = () =>
      cls.run(() => {
        cls.set('tenantId', tenantAId);
        return tenantDb.run((manager) =>
          manager.save(
            manager.create(CustomerRefreshToken, {
              tenantId: tenantBId,
              customerId: customerAId,
              tokenHash: `forged-hash-${randomUUID()}`,
              familyId: randomUUID(),
              expiresAt: new Date(Date.now() + 60 * 60 * 1000),
              revokedAt: null,
            }),
          ),
        );
      });

    // SQLSTATE 42501 / "new row violates row-level security policy" — this must
    // be the RLS WITH CHECK clause rejecting it, not an application-level
    // filter and not an incidental FK failure.
    await expect(attemptedWrite()).rejects.toThrow(
      /violates row-level security policy/i,
    );
  });

  it('leaves no trace of a rejected cross-tenant write under either tenant', async () => {
    const forgedHash = `forged-hash-${randomUUID()}`;

    await expect(
      cls.run(() => {
        cls.set('tenantId', tenantAId);
        return tenantDb.run((manager) =>
          manager.save(
            manager.create(CustomerRefreshToken, {
              tenantId: tenantBId,
              customerId: customerAId,
              tokenHash: forgedHash,
              familyId: randomUUID(),
              expiresAt: new Date(Date.now() + 60 * 60 * 1000),
              revokedAt: null,
            }),
          ),
        );
      }),
    ).rejects.toThrow();

    for (const tenantId of [tenantAId, tenantBId]) {
      const rows = await cls.run(() => {
        cls.set('tenantId', tenantId);
        return tenantDb.run((manager) =>
          manager.find(CustomerRefreshToken, {
            where: { tokenHash: forgedHash },
          }),
        );
      });
      expect(rows).toHaveLength(0);
    }
  });
});
