import type { QueryRunner } from 'typeorm';

// Shared boilerplate for the RLS SQL every tenant-scoped table migration must
// write by hand (TypeORM has no policy API — see D2/D3 in
// docs/architecture/references). Call enableRls(...) in a migration's up()
// right after CREATE TABLE, and disableRls(...) in down() before DROP TABLE.
// Table/column/policy names here are always migration-author-supplied
// identifiers, never end-user input, so string interpolation into DDL is safe
// (DDL identifiers can't be bind-parameterized anyway).
export async function enableRls(
  queryRunner: QueryRunner,
  table: string,
  { tenantColumn = 'tenant_id', policyName = 'tenant_isolation' } = {},
): Promise<void> {
  await queryRunner.query(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
  await queryRunner.query(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`); // owner bypasses RLS without FORCE
  // missing_ok=true: without it, current_setting throws "unrecognized
  // configuration parameter" whenever app.current_tenant hasn't been set in
  // the session yet (e.g. migrations, which run as owner and never call
  // withTenant) — even against an empty table, since the planner evaluates
  // this stable expression up front. NULL still fails the tenant_id equality
  // check, so unset context stays fail-closed.
  await queryRunner.query(`
    CREATE POLICY "${policyName}" ON "${table}"
      USING      ("${tenantColumn}" = current_setting('app.current_tenant', true)::uuid)
      WITH CHECK ("${tenantColumn}" = current_setting('app.current_tenant', true)::uuid)
  `);
  await assertRlsEnforced(queryRunner, table);
}

// Re-reads pg_catalog in the SAME transaction as the migration, right after
// claiming to have enabled RLS. If this throws, the migration's transaction
// rolls back and nothing it did (including earlier CREATE TABLEs) is
// committed — a broken enableRls() call fails the whole migration instead of
// shipping an unprotected table, even for the brief window before
// db:migrate's own revert-on-failure step would catch it.
async function assertRlsEnforced(
  queryRunner: QueryRunner,
  table: string,
): Promise<void> {
  interface RlsStatusRow {
    rls_enabled: boolean;
    rls_forced: boolean;
    policy_count: string;
  }

  const rows = (await queryRunner.query(
    `
      select
        c.relrowsecurity as rls_enabled,
        c.relforcerowsecurity as rls_forced,
        (
          select count(*) from pg_policies p
          where p.schemaname = n.nspname and p.tablename = c.relname
        ) as policy_count
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = $1
    `,
    [table],
  )) as RlsStatusRow[];

  const row = rows[0];
  const problems: string[] = [];
  if (!row?.rls_enabled) problems.push(`${table}: RLS not ENABLEd`);
  if (!row?.rls_forced)
    problems.push(`${table}: RLS not FORCEd (table owner would bypass it)`);
  if (!row || Number(row.policy_count) === 0)
    problems.push(`${table}: no RLS policy defined`);

  if (problems.length > 0) {
    throw new Error(`RLS verification failed:\n  - ${problems.join('\n  - ')}`);
  }
}

export async function disableRls(
  queryRunner: QueryRunner,
  table: string,
  { policyName = 'tenant_isolation' } = {},
): Promise<void> {
  await queryRunner.query(
    `DROP POLICY IF EXISTS "${policyName}" ON "${table}"`,
  );
  await queryRunner.query(`ALTER TABLE "${table}" DISABLE ROW LEVEL SECURITY`);
}
