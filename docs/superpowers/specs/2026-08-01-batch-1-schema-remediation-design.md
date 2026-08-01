# Batch 1 — Schema Provisioning Remediation Design

**Date:** 2026-08-01  
**Status:** Approved  
**Scope:** Remediation of issues R1 (out-of-order migration timestamp) and R2 (unconditional `DROP TABLE` in migration `up()`) from `docs/plans/api-review-remediation-plan.md`.

---

## 1. Executive Summary

Batch 1 restores the ability to provision a PostgreSQL database from zero. Currently, `1722510000000-CreateOrderAndCheckoutTables.ts` carries a timestamp from August 2024, whereas preceding core migrations carry timestamps from July/August 2026. This causes TypeORM to run the orders/checkout migration *first* on fresh database setups, failing immediately due to missing table references (`tenants`). Additionally, `up()` in this migration opens with an unconditional `DROP TABLE IF EXISTS ... CASCADE;` statement which presents a destructive data loss risk if ever executed against a populated database.

This specification details the renaming, preamble cleanup, database migration reconciliation, and prevention guardrails (fresh migration script + fast unit test) to resolve R1 and R2.

---

## 2. Component Design & Changes

### 2.1 Migration Fixes (R1 & R2)

1. **Rename File**:
   - `apps/api/src/db/migrations/1722510000000-CreateOrderAndCheckoutTables.ts`
   - `→ apps/api/src/db/migrations/1785330000000-CreateOrderAndCheckoutTables.ts`

2. **Class & Property Update**:
   Update `apps/api/src/db/migrations/1785330000000-CreateOrderAndCheckoutTables.ts`:
   - Class name: `CreateOrderAndCheckoutTables1785330000000`
   - `name` property: `'CreateOrderAndCheckoutTables1785330000000'`

3. **Remove Destructive Preamble (R2)**:
   Delete the initial `DROP TABLE IF EXISTS` statement from `up()`:
   ```ts
   // Remove:
   await queryRunner.query(
     `DROP TABLE IF EXISTS "refunds", "settlements", "payments", "order_events", "order_items", "orders", "tenant_settings" CASCADE;`,
   );
   ```

### 2.2 Existing Database Reconciliation

To prevent TypeORM from attempting to re-run the renamed migration on existing dev/test environments:
- Update the `migrations` table in existing databases as `app_owner`:
  ```sql
  UPDATE migrations
     SET name = 'CreateOrderAndCheckoutTables1785330000000'
   WHERE name = 'CreateOrderAndCheckoutTables1722510000000';
  ```
- Reconcile both local dev (`tt_dev`/`postgres`) and local test (`postgres-test`) database containers.
- Verify with `typeorm migration:show` that 0 migrations are pending.

---

## 3. Prevention & Automation

### 3.1 Fresh Database Verification Script

Create `apps/api/scripts/db-verify-fresh.sh`:
- Connects to PostgreSQL, creates a temporary database (`tt_fresh_$$`).
- Runs `typeorm migration:run` to ensure all migrations execute cleanly in sequence from scratch.
- Runs `pnpm db:verify-rls` to verify Row-Level Security policies on all tenant tables.
- Cleans up and drops `tt_fresh_$$` on exit.

Add script targets:
- `apps/api/package.json`: `"db:verify-fresh": "sh scripts/db-verify-fresh.sh"`
- Root `package.json`: `"db:verify-fresh": "pnpm --filter @tiny-threads/api db:verify-fresh"`

### 3.2 Static Monotonicity & Safety Unit Test

Create `apps/api/src/db/__tests__/migration-order.spec.ts`:
- Fast unit test running under Jest.
- Inspects all `.ts` migration files in `apps/api/src/db/migrations/`.
- Asserts that file timestamp prefixes are strictly increasing in filename order.
- Asserts that no duplicate timestamps exist.
- Asserts that each file's exported class name and `name` property match its filename prefix.
- Scans `up()` implementations for `DROP TABLE` and asserts that no table is dropped unless `CREATE TABLE` for the same table exists in the same migration `up()`.

---

## 4. Verification Criteria

1. **Unit Test**: `pnpm --filter @tiny-threads/api test -- migration-order` passes cleanly.
2. **Fresh Migration**: `pnpm db:verify-fresh` passes cleanly without errors.
3. **Existing DB Status**: `typeorm migration:show` against dev and test environments reports no pending migrations.
