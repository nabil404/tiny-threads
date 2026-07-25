import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../../../../../.env') });

import { DataSource } from 'typeorm';
import { ClsService, ClsServiceManager } from 'nestjs-cls';
import { Tenant, Order } from '../entities';
import { withTenant } from '../tenant-db';

describe('withTenant (RLS isolation)', () => {
  let dataSource: DataSource;
  let cls: ClsService;

  const tenantA = {
    id: '019353c2-1b1a-7000-8000-000000000001',
    name: 'Tenant A',
    slug: 'tenant-a',
  };
  const tenantB = {
    id: '019353c2-1b1a-7000-8000-000000000002',
    name: 'Tenant B',
    slug: 'tenant-b',
  };

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set');
    }
    dataSource = new DataSource({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [Tenant, Order],
    });
    await dataSource.initialize();
    cls = ClsServiceManager.getClsService();

    // app_owner is subject to RLS too (FORCE applies to the table owner), so
    // seeding/cleanup needs an actual superuser connection to bypass it.
    const superuserDataSource = new DataSource({
      type: 'postgres',
      url: `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@localhost:5432/${process.env.POSTGRES_DB}`,
      entities: [Tenant, Order],
    });
    await superuserDataSource.initialize();
    await superuserDataSource.query(`DELETE FROM "orders"`);
    await superuserDataSource.query(`DELETE FROM "tenants"`);
    await superuserDataSource.getRepository(Tenant).save([tenantA, tenantB]);
    await superuserDataSource.destroy();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  function runAs<T>(
    tenantId: string,
    work: Parameters<typeof withTenant>[2],
  ): Promise<T> {
    return cls.run(() => {
      cls.set('tenantId', tenantId);
      return withTenant(dataSource, cls, work) as Promise<T>;
    });
  }

  it('throws when no tenant in context (fails closed)', async () => {
    await expect(
      cls.run(() =>
        withTenant(dataSource, cls, async (manager) =>
          manager.getRepository(Order).find(),
        ),
      ),
    ).rejects.toThrow('withTenant called with no tenant in context');
  });

  it('only ever sees rows belonging to the tenant in context', async () => {
    await runAs(tenantA.id, (manager) => {
      const repo = manager.getRepository(Order);
      return repo.save(
        repo.create({ tenantId: tenantA.id, number: 'A-1', status: 'pending' }),
      );
    });
    await runAs(tenantB.id, (manager) => {
      const repo = manager.getRepository(Order);
      return repo.save(
        repo.create({ tenantId: tenantB.id, number: 'B-1', status: 'pending' }),
      );
    });

    const ordersForA = await runAs<Order[]>(tenantA.id, (manager) =>
      manager.getRepository(Order).find(),
    );
    const ordersForB = await runAs<Order[]>(tenantB.id, (manager) =>
      manager.getRepository(Order).find(),
    );

    expect(ordersForA).toHaveLength(1);
    expect(ordersForA[0].number).toBe('A-1');
    expect(ordersForB).toHaveLength(1);
    expect(ordersForB[0].number).toBe('B-1');
  });

  it('cannot write a row into another tenant (WITH CHECK rejects it)', async () => {
    await expect(
      runAs(tenantA.id, (manager) => {
        const repo = manager.getRepository(Order);
        return repo.save(
          repo.create({
            tenantId: tenantB.id,
            number: 'SNEAKY',
            status: 'pending',
          }),
        );
      }),
    ).rejects.toThrow();
  });

  it('isolates concurrent requests for different tenants with no context bleed', async () => {
    await Promise.all(
      Array.from({ length: 10 }, () =>
        runAs(tenantA.id, (manager) =>
          manager
            .getRepository(Order)
            .find({ where: { tenantId: tenantA.id } }),
        ),
      ),
    );

    const [resultsA, resultsB] = await Promise.all([
      Promise.all(
        Array.from({ length: 5 }, () =>
          runAs<Order[]>(tenantA.id, (manager) =>
            manager.getRepository(Order).find(),
          ),
        ),
      ),
      Promise.all(
        Array.from({ length: 5 }, () =>
          runAs<Order[]>(tenantB.id, (manager) =>
            manager.getRepository(Order).find(),
          ),
        ),
      ),
    ]);

    for (const rows of resultsA) {
      expect(rows.every((r) => r.tenantId === tenantA.id)).toBe(true);
    }
    for (const rows of resultsB) {
      expect(rows.every((r) => r.tenantId === tenantB.id)).toBe(true);
    }
  });
});
