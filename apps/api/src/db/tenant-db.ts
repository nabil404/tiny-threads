import type { DataSource, EntityManager } from 'typeorm';
import type { ClsService } from 'nestjs-cls';

// The ONLY place tenant context is set. All tenant-scoped DB access must go
// through this — never inject the DataSource/EntityManager directly for
// tenant-scoped tables.
export async function withTenant<T>(
  dataSource: DataSource,
  cls: ClsService,
  work: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  const tenantId = cls.get<string>('tenantId');
  if (!tenantId) {
    throw new Error('withTenant called with no tenant in context');
  }

  return dataSource.transaction(async (manager) => {
    // set_config(name, value, is_local=true) == SET LOCAL, but parameterized —
    // avoids string-interpolating the tenant id. Transaction-local, so it
    // clears on commit/rollback and never bleeds across pooled connections.
    await manager.query(`select set_config('app.current_tenant', $1, true)`, [
      tenantId,
    ]);
    return work(manager);
  });
}
