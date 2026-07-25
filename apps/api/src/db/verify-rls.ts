import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { typeOrmConfig } from './data-source';

// Safety net for the invariant migrations are supposed to uphold by hand:
// every table with a tenant_id column must have RLS ENABLEd, FORCEd, and at
// least one policy. Run after every migration (wired into `db:migrate`) so a
// forgotten enableRls() call in a new migration fails the pipeline instead of
// silently shipping an unprotected table.
interface TenantTableRow {
  table_name: string;
  rls_enabled: boolean;
  rls_forced: boolean;
  policy_count: string;
}

async function main() {
  const dataSource = new DataSource(typeOrmConfig);
  await dataSource.initialize();

  try {
    const rows: TenantTableRow[] = await dataSource.query(`
      select
        c.relname as table_name,
        c.relrowsecurity as rls_enabled,
        c.relforcerowsecurity as rls_forced,
        (
          select count(*) from pg_policies p
          where p.schemaname = n.nspname and p.tablename = c.relname
        ) as policy_count
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind = 'r'
        and exists (
          select 1 from pg_attribute a
          where a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped
        )
      order by c.relname
    `);

    if (rows.length === 0) {
      console.log(
        'No tenant-scoped tables found (no table has a tenant_id column).',
      );
      return;
    }

    console.log(
      `Checked ${rows.length} tenant-scoped table(s): ${rows.map((r) => r.table_name).join(', ')}`,
    );

    const problems: string[] = [];
    for (const row of rows) {
      if (!row.rls_enabled) problems.push(`${row.table_name}: RLS not ENABLEd`);
      if (!row.rls_forced)
        problems.push(
          `${row.table_name}: RLS not FORCEd (table owner would bypass it)`,
        );
      if (Number(row.policy_count) === 0)
        problems.push(`${row.table_name}: no RLS policy defined`);
    }

    if (problems.length > 0) {
      console.error('\nRLS verification FAILED:');
      for (const problem of problems) console.error(`  - ${problem}`);
      process.exitCode = 1;
      return;
    }

    console.log(
      'RLS verification passed: every tenant-scoped table has ENABLE + FORCE + at least one policy.',
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
