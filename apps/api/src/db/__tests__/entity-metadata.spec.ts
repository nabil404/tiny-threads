import { getMetadataArgsStorage } from 'typeorm';
import * as entities from '../entities';

type EntityClass = abstract new (...args: never[]) => unknown;

const TENANT_SCOPED_TABLES = [
  'merchant_users',
  'merchant_user_identities',
  'merchant_user_refresh_tokens',
  'merchant_user_invites',
  'products',
  'product_variants',
  'categories',
  'product_categories',
  'customers',
  'customer_addresses',
  'customer_identities',
  'customer_refresh_tokens',
  'carts',
  'cart_items',
  'tenant_settings',
  'orders',
  'order_items',
  'order_events',
  'payments',
  'settlements',
  'refunds',
  'payment_provider_configs',
  'shipments',
  'shipment_items',
];

const GLOBAL_TABLES = [
  'tenants',
  'platform_admins',
  'currencies',
  'countries',
  'payment_providers',
];

// Natural-key global tables (no surrogate id, no @BeforeInsert).
const NATURAL_KEY_TABLES = ['currencies', 'countries', 'payment_providers'];

function tableNameFor(target: EntityClass): string {
  const table = getMetadataArgsStorage().tables.find(
    (t) => t.target === target,
  );
  if (!table || typeof table.name !== 'string') {
    throw new Error(`No table metadata for ${String(target)}`);
  }
  return table.name;
}

function primaryColumnNamesFor(target: EntityClass): string[] {
  return getMetadataArgsStorage()
    .columns.filter((c) => isTargetOrAncestor(c.target, target))
    .filter((c) => c.options.primary)
    .map((c) => c.options.name ?? c.propertyName);
}

function hasBeforeInsertFor(target: EntityClass): boolean {
  return getMetadataArgsStorage()
    .entityListeners.filter((h) => h.type === 'before-insert')
    .some((h) => isTargetOrAncestor(h.target, target));
}

function hasColumnFor(target: EntityClass, columnName: string): boolean {
  return getMetadataArgsStorage()
    .columns.filter((c) => isTargetOrAncestor(c.target, target))
    .some((c) => (c.options.name ?? c.propertyName) === columnName);
}

// Column/hook metadata is registered against the class that declares it
// (base or subclass), not the leaf entity — walk the prototype chain to
// find matches from either.
function isTargetOrAncestor(
  candidate: EntityClass | string,
  target: EntityClass,
): boolean {
  if (typeof candidate === 'string') return false;
  let current: EntityClass | undefined = target;
  while (current) {
    if (current === candidate) return true;
    current = Object.getPrototypeOf(current) as EntityClass | undefined;
    if (current === Function.prototype || current === Object) break;
  }
  return false;
}

function indicesFor(target: EntityClass) {
  return getMetadataArgsStorage().indices.filter((i) =>
    isTargetOrAncestor(i.target, target),
  );
}

function indexColumnNames(
  indexArgs: ReturnType<typeof getMetadataArgsStorage>['indices'][number],
): string[] {
  if (Array.isArray(indexArgs.columns)) {
    return indexArgs.columns;
  }
  if (typeof indexArgs.columns === 'function') {
    const res = indexArgs.columns();
    if (Array.isArray(res)) return res as string[];
    if (res && typeof res === 'object') return Object.keys(res);
  }
  if (indexArgs.propertyName) {
    return [indexArgs.propertyName];
  }
  return [];
}

const entityClasses = Object.values(entities).filter(
  (value): value is new () => object => typeof value === 'function',
);

function entityByTableName(name: string): new () => object {
  const found = entityClasses.find((cls) => tableNameFor(cls) === name);
  if (!found) throw new Error(`No entity registered for table "${name}"`);
  return found;
}

describe('entity metadata (tenancy shape)', () => {
  it.each(TENANT_SCOPED_TABLES)(
    'tenant-scoped table %s has the correct primary key columns',
    (tableName) => {
      const entity = entityByTableName(tableName);
      const primaryColumns = primaryColumnNamesFor(entity).sort();

      if (tableName === 'product_categories') {
        expect(primaryColumns).toEqual(
          ['category_id', 'product_id', 'tenant_id'].sort(),
        );
      } else {
        expect(primaryColumns).toEqual(['id', 'tenant_id'].sort());
      }
    },
  );

  it.each(TENANT_SCOPED_TABLES)(
    'tenant-scoped table %s defines at least one index beyond its primary key',
    (tableName) => {
      const entity = entityByTableName(tableName);
      const indices = indicesFor(entity);
      expect(indices.length).toBeGreaterThan(0);
    },
  );

  it.each(TENANT_SCOPED_TABLES)(
    'tenant-scoped table %s has tenant_id / tenantId as the leading column in all composite indices',
    (tableName) => {
      const entity = entityByTableName(tableName);
      const indices = indicesFor(entity);
      for (const index of indices) {
        const cols = indexColumnNames(index);
        if (cols.length > 1) {
          expect(['tenant_id', 'tenantId']).toContain(cols[0]);
        }
      }
    },
  );

  it.each(GLOBAL_TABLES)(
    'global table %s does not declare a tenant_id column',
    (tableName) => {
      const entity = entityByTableName(tableName);
      expect(hasColumnFor(entity, 'tenant_id')).toBe(false);
    },
  );

  it.each(
    [...TENANT_SCOPED_TABLES, ...GLOBAL_TABLES].filter(
      (tableName) =>
        tableName !== 'product_categories' &&
        !NATURAL_KEY_TABLES.includes(tableName),
    ),
  )('table %s with a surrogate id has a @BeforeInsert hook', (tableName) => {
    const entity = entityByTableName(tableName);
    expect(hasBeforeInsertFor(entity)).toBe(true);
  });
});
