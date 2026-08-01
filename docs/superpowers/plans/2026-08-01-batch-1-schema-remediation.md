# Batch 1 — Schema Provisioning Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore zero-schema database provisioning and eliminate destructive `DROP TABLE` migration preambles by renumbering the out-of-order migration, updating DB migration history, adding a static unit test guard, and creating a fresh-database migration verification script.

**Architecture:** Renumbers `1722510000000-CreateOrderAndCheckoutTables.ts` to `1785330000000-CreateOrderAndCheckoutTables.ts` so it executes after initial migrations, deletes the unsafe `DROP TABLE` preamble in its `up()` method, reconciles the `migrations` table name in existing dev/test DB containers, and introduces two automated guards: a Jest static test (`migration-order.spec.ts`) and a scratch-DB verification script (`db-verify-fresh.sh`).

**Tech Stack:** NestJS 11, TypeORM 1.1, PostgreSQL 16, Jest, Shell / bash / psql.

## Global Constraints

- Migration filename timestamp prefix, exported class name suffix, and class `name` property MUST match identically (`1785330000000`).
- No migration's `up()` method may `DROP TABLE` unless the table is created within the same `up()` method.
- Existing dev and test PostgreSQL containers must have their `migrations` table updated so `typeorm migration:show` reports zero pending migrations.
- `db-verify-fresh.sh` must execute `typeorm migration:run` against a clean database and verify RLS policies using `db:verify-rls`.

---

### Task 1: Renumber Order & Checkout Migration, Remove Destructive Preamble, and Reconcile Database History

**Files:**
- Rename & Modify: `apps/api/src/db/migrations/1722510000000-CreateOrderAndCheckoutTables.ts` → `apps/api/src/db/migrations/1785330000000-CreateOrderAndCheckoutTables.ts`

**Interfaces:**
- Consumes: Existing migrations in `apps/api/src/db/migrations/`
- Produces: Correctly ordered TypeORM migration class `CreateOrderAndCheckoutTables1785330000000`

- [ ] **Step 1: Rename migration file**

```bash
git mv apps/api/src/db/migrations/1722510000000-CreateOrderAndCheckoutTables.ts apps/api/src/db/migrations/1785330000000-CreateOrderAndCheckoutTables.ts
```

- [ ] **Step 2: Update class name, `name` property, and remove `DROP TABLE` preamble**

In `apps/api/src/db/migrations/1785330000000-CreateOrderAndCheckoutTables.ts`:
- Change class name to `CreateOrderAndCheckoutTables1785330000000`
- Change `name` property to `'CreateOrderAndCheckoutTables1785330000000'`
- Remove lines 8-11 containing `DROP TABLE IF EXISTS "refunds", "settlements", "payments", "order_events", "order_items", "orders", "tenant_settings" CASCADE;`

Target code structure:
```ts
import { MigrationInterface, QueryRunner } from 'typeorm';
import { enableRls, disableRls } from './helpers/rls.helper';

export class CreateOrderAndCheckoutTables1785330000000 implements MigrationInterface {
  name = 'CreateOrderAndCheckoutTables1785330000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "tenant_settings" (
        "tenant_id" uuid NOT NULL,
        "id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "allow_guest_checkout" boolean NOT NULL DEFAULT true,
        "platform_fee_percent" numeric(5,2) NOT NULL DEFAULT 2.50,
        CONSTRAINT "PK_tenant_settings" PRIMARY KEY ("tenant_id", "id")
      );
    `);
```

- [ ] **Step 3: Update `migrations` table in local dev and test database containers**

Execute the SQL update against dev and test databases:
```bash
# Update dev database
psql "postgresql://app_owner:app_owner_pass@localhost:5432/tt_dev" -c "UPDATE migrations SET name = 'CreateOrderAndCheckoutTables1785330000000' WHERE name = 'CreateOrderAndCheckoutTables1722510000000';"

# Ensure test DB container is running and update test database
pnpm --filter @tiny-threads/api test:db:up
psql "postgresql://app_owner:app_owner_pass@localhost:5433/tt_test" -c "UPDATE migrations SET name = 'CreateOrderAndCheckoutTables1785330000000' WHERE name = 'CreateOrderAndCheckoutTables1722510000000';"
```

- [ ] **Step 4: Verify migration status**

Run: `pnpm --filter @tiny-threads/api db:migrate`
Expected output: No new migrations executed, RLS verification OK, zero pending migrations.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db/migrations/
git commit -m "fix(db): renumber CreateOrderAndCheckoutTables migration and remove DROP TABLE preamble"
```

---

### Task 2: Implement Migration Order and Safety Unit Test Guard

**Files:**
- Create: `apps/api/src/db/__tests__/migration-order.spec.ts`

**Interfaces:**
- Consumes: Migration files under `apps/api/src/db/migrations/`
- Produces: Jest unit test verifying migration timestamps, naming consistency, and `DROP TABLE` safety rules.

- [ ] **Step 1: Write failing test / test scaffolding for migration file rules**

Create `apps/api/src/db/__tests__/migration-order.spec.ts`:
```ts
import * as fs from 'fs';
import * as path from 'path';

describe('Migration Order & Safety Guard', () => {
  const migrationsDir = path.join(__dirname, '../migrations');

  function getMigrationFiles(): string[] {
    return fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))
      .sort();
  }

  it('should have strictly increasing numeric timestamp prefixes in filename order', () => {
    const files = getMigrationFiles();
    let prevTimestamp = 0;

    for (const file of files) {
      const match = file.match(/^(\d+)-/);
      expect(match).not.toBeNull();
      const timestamp = parseInt(match![1], 10);
      expect(timestamp).toBeGreaterThan(prevTimestamp);
      prevTimestamp = timestamp;
    }
  });

  it('should match exported class name and name property with filename timestamp', () => {
    const files = getMigrationFiles();

    for (const file of files) {
      const match = file.match(/^(\d+)-(.*)\.ts$/);
      expect(match).not.toBeNull();
      const timestamp = match![1];
      const baseName = match![2];
      const expectedName = `${baseName}${timestamp}`;

      const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      // Assert exported class name matches
      expect(content).toContain(`export class ${expectedName}`);

      // Assert name property matches
      expect(content).toContain(`name = '${expectedName}'`);
    }
  });

  it('should not contain DROP TABLE in up() unless table is CREATEd in the same up()', () => {
    const files = getMigrationFiles();

    for (const file of files) {
      const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      
      // Extract up() method block
      const upMatch = content.match(/public async up\([\s\S]*?\): Promise<void> \{([\s\S]*?)\n  \}/);
      if (!upMatch) continue;
      const upBody = upMatch[1];

      // Find all DROP TABLE instances
      const dropMatches = Array.from(upBody.matchAll(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([^\s;]+)/gi));

      for (const dropMatch of dropMatches) {
        const droppedTablesStr = dropMatch[1];
        // Clean table names (remove quotes and commas)
        const droppedTables = droppedTablesStr
          .split(',')
          .map((t) => t.replace(/["\s]/g, ''))
          .filter(Boolean);

        for (const table of droppedTables) {
          // Check if table is created in upBody
          const createRegex = new RegExp(`CREATE\\s+TABLE\\s+(?:IF\s+NOT\s+EXISTS\s+)?"?${table}"?`, 'i');
          expect(upBody).toMatch(createRegex);
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/api test -- migration-order`
Expected output: PASS with 3 tests passing.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/db/__tests__/migration-order.spec.ts
git commit -m "test(db): add static migration order and drop-table safety guard"
```

---

### Task 3: Add Fresh Database Migration Script and Package Targets

**Files:**
- Create: `apps/api/scripts/db-verify-fresh.sh`
- Modify: `apps/api/package.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: PostgreSQL connection URL (`DATABASE_URL_MIGRATIONS`), TypeORM DataSource (`./src/db/data-source.ts`)
- Produces: `pnpm db:verify-fresh` command ensuring clean migrations from zero.

- [ ] **Step 1: Create `apps/api/scripts/db-verify-fresh.sh`**

```sh
#!/bin/sh
# Proves the schema can be built from nothing. The pretest hooks only ever
# migrate a database that already holds earlier migrations, which is why an
# out-of-order timestamp (R1) was invisible to every other check.
set -eu

DB="tt_fresh_$$"
BASE_URL="${DATABASE_URL_MIGRATIONS:-postgresql://app_owner:app_owner_pass@localhost:5432/postgres}"
BASE="${BASE_URL%/*}"

cleanup() { psql "$BASE/postgres" -c "DROP DATABASE IF EXISTS \"$DB\"" >/dev/null 2>&1 || true; }
trap cleanup EXIT

psql "$BASE/postgres" -c "CREATE DATABASE \"$DB\" OWNER app_owner"
DATABASE_URL_MIGRATIONS="$BASE/$DB" \
  typeorm-ts-node-commonjs migration:run -d ./src/db/data-source.ts
DATABASE_URL="$BASE/$DB" pnpm db:verify-rls
echo "fresh-database migration + RLS verification OK"
```

Make script executable:
```bash
chmod +x apps/api/scripts/db-verify-fresh.sh
```

- [ ] **Step 2: Wire script into `apps/api/package.json` and `package.json`**

In `apps/api/package.json`:
Add `"db:verify-fresh": "sh scripts/db-verify-fresh.sh"` under `"scripts"`.

In root `package.json`:
Add `"db:verify-fresh": "pnpm --filter @tiny-threads/api db:verify-fresh"` under `"scripts"`.

- [ ] **Step 3: Run `pnpm db:verify-fresh` to verify it passes**

Run: `pnpm db:verify-fresh`
Expected output:
```
CREATE DATABASE
... 10 migrations are new migrations must be executed ...
RLS Policy Verification Passed successfully!
fresh-database migration + RLS verification OK
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/scripts/db-verify-fresh.sh apps/api/package.json package.json
git commit -m "feat(db): add db:verify-fresh script for clean database migration verification"
```
