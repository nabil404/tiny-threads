import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBatch4IndexesAndTenantSettings1785340000000 implements MigrationInterface {
  name = 'AddBatch4IndexesAndTenantSettings1785340000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add default_currency_code to tenant_settings with FK to currencies(code)
    await queryRunner.query(
      `ALTER TABLE "tenant_settings" ADD COLUMN "default_currency_code" text NOT NULL DEFAULT 'USD'`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_settings" ADD CONSTRAINT "FK_tenant_settings_default_currency_code" FOREIGN KEY ("default_currency_code") REFERENCES "currencies"("code") ON UPDATE CASCADE ON DELETE RESTRICT`,
    );

    // 2. RLS-safe deduplication and unique index on tenant_settings(tenant_id)
    await queryRunner.query(
      `ALTER TABLE "tenant_settings" NO FORCE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `DELETE FROM "tenant_settings" a USING "tenant_settings" b WHERE a.tenant_id = b.tenant_id AND a.created_at > b.created_at`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_settings" FORCE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "tenant_settings_tenant_uidx" ON "tenant_settings" ("tenant_id")`,
    );

    // 3. Performance indexes on commerce tables
    await queryRunner.query(
      `CREATE INDEX "orders_tenant_customer_created_idx" ON "orders" ("tenant_id", "customer_id", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "orders_tenant_status_created_idx" ON "orders" ("tenant_id", "status", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "orders_tenant_created_idx" ON "orders" ("tenant_id", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "order_items_tenant_order_idx" ON "order_items" ("tenant_id", "order_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "order_events_tenant_order_created_idx" ON "order_events" ("tenant_id", "order_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "payments_tenant_order_status_idx" ON "payments" ("tenant_id", "order_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "settlements_tenant_payment_idx" ON "settlements" ("tenant_id", "payment_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "settlements_tenant_order_idx" ON "settlements" ("tenant_id", "order_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "refunds_tenant_payment_idx" ON "refunds" ("tenant_id", "payment_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "refunds_tenant_order_idx" ON "refunds" ("tenant_id", "order_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "refunds_tenant_order_idx"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "refunds_tenant_payment_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "settlements_tenant_order_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "settlements_tenant_payment_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "payments_tenant_order_status_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "order_events_tenant_order_created_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "order_items_tenant_order_idx"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "orders_tenant_created_idx"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "orders_tenant_status_created_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "orders_tenant_customer_created_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "tenant_settings_tenant_uidx"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_settings" DROP CONSTRAINT IF EXISTS "FK_tenant_settings_default_currency_code"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_settings" DROP COLUMN IF EXISTS "default_currency_code"`,
    );
  }
}
