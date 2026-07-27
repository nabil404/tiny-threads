import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../../../.env') });

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
      tenantRepo.create({ name: 'RLS Test Tenant A', slug: `rls-test-a-${randomUUID()}` }),
    );
    const tenantB = await tenantRepo.save(
      tenantRepo.create({ name: 'RLS Test Tenant B', slug: `rls-test-b-${randomUUID()}` }),
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
        manager.find(CustomerRefreshToken, { where: { customerId: customerAId } }),
      );
    });

    expect(rows).toHaveLength(0);
  });

  it('is visible when queried under its own tenant context', async () => {
    const rows = await cls.run(() => {
      cls.set('tenantId', tenantAId);
      return tenantDb.run((manager) =>
        manager.find(CustomerRefreshToken, { where: { customerId: customerAId } }),
      );
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toEqual('test-hash-a');
  });
});
