import { MigrationInterface, QueryRunner } from 'typeorm';

export class Batch5ArchitecturalRedesign1785350000000 implements MigrationInterface {
  name = 'Batch5ArchitecturalRedesign1785350000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 0. Ensure uuid_generate_v7() function exists
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION uuid_generate_v7()
      RETURNS uuid AS $$
      DECLARE
        unix_ts_ms bytea;
        uuid_bytes bytea;
      BEGIN
        unix_ts_ms := substring(int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint) from 3);
        uuid_bytes := unix_ts_ms || decode(md5(random()::text || clock_timestamp()::text), 'hex');
        uuid_bytes := substring(uuid_bytes from 1 for 16);
        uuid_bytes := set_byte(uuid_bytes, 6, (get_byte(uuid_bytes, 6) & 15) | 112);
        uuid_bytes := set_byte(uuid_bytes, 8, (get_byte(uuid_bytes, 8) & 63) | 128);
        RETURN encode(uuid_bytes, 'hex')::uuid;
      END;
      $$ LANGUAGE plpgsql VOLATILE;
    `);

    // 1. Create shipments and shipment_items tables
    await queryRunner.query(`
      CREATE TABLE "shipments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v7(),
        "tenant_id" uuid NOT NULL,
        "order_id" uuid NOT NULL,
        "carrier" varchar(100) NOT NULL,
        "tracking_number" varchar(200),
        "tracking_url" text,
        "status" varchar(50) NOT NULL DEFAULT 'shipped',
        "shipped_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_shipments" PRIMARY KEY ("tenant_id", "id"),
        CONSTRAINT "FK_shipments_tenants" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_shipments_orders" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id", "id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`ALTER TABLE "shipments" ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`ALTER TABLE "shipments" FORCE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation_policy ON "shipments"
      USING ("tenant_id" = current_setting('app.current_tenant', true)::uuid);
    `);

    await queryRunner.query(`
      CREATE TABLE "shipment_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v7(),
        "tenant_id" uuid NOT NULL,
        "shipment_id" uuid NOT NULL,
        "order_item_id" uuid NOT NULL,
        "quantity" integer NOT NULL CHECK ("quantity" > 0),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_shipment_items" PRIMARY KEY ("tenant_id", "id"),
        CONSTRAINT "FK_shipment_items_tenants" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_shipment_items_shipments" FOREIGN KEY ("tenant_id", "shipment_id") REFERENCES "shipments"("tenant_id", "id") ON DELETE CASCADE,
        CONSTRAINT "FK_shipment_items_order_items" FOREIGN KEY ("tenant_id", "order_item_id") REFERENCES "order_items"("tenant_id", "id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`ALTER TABLE "shipment_items" ENABLE ROW LEVEL SECURITY;`);
    await queryRunner.query(`ALTER TABLE "shipment_items" FORCE ROW LEVEL SECURITY;`);
    await queryRunner.query(`
      CREATE POLICY tenant_isolation_policy ON "shipment_items"
      USING ("tenant_id" = current_setting('app.current_tenant', true)::uuid);
    `);

    await queryRunner.query(`CREATE INDEX "shipments_tenant_order_idx" ON "shipments" ("tenant_id", "order_id");`);
    await queryRunner.query(`CREATE INDEX "shipment_items_tenant_shipment_idx" ON "shipment_items" ("tenant_id", "shipment_id");`);

    // 2. Add columns to orders, tenant_settings, order_events
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN "fulfillment_status" varchar(50) NOT NULL DEFAULT 'unfulfilled';`);
    await queryRunner.query(`ALTER TABLE "tenant_settings" ADD COLUMN "capture_mode" varchar(50) NOT NULL DEFAULT 'immediate';`);
    await queryRunner.query(`ALTER TABLE "tenant_settings" ADD CONSTRAINT "CK_tenant_settings_capture_mode" CHECK ("capture_mode" IN ('immediate', 'authorize_then_capture'));`);
    await queryRunner.query(`ALTER TABLE "order_events" ADD COLUMN "provider_event_id" varchar(255);`);
    await queryRunner.query(`CREATE UNIQUE INDEX "order_events_tenant_provider_event_uidx" ON "order_events" ("tenant_id", "provider_event_id") WHERE "provider_event_id" IS NOT NULL;`);

    // 3. Migrate existing order rows to new sub-machine statuses
    await queryRunner.query(`
      UPDATE "orders" SET
        "fulfillment_status" = CASE WHEN "status" IN ('shipped', 'delivered') THEN 'fulfilled' ELSE 'unfulfilled' END,
        "payment_status" = CASE WHEN "status" = 'cancelled' THEN 'voided' ELSE 'paid' END,
        "status" = CASE
          WHEN "status" = 'pending_payment' THEN 'pending'
          WHEN "status" IN ('paid', 'processing', 'shipped') THEN 'confirmed'
          WHEN "status" = 'delivered' THEN 'completed'
          WHEN "status" = 'cancelled' THEN 'cancelled'
          ELSE 'confirmed'
        END;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "order_events_tenant_provider_event_uidx";`);
    await queryRunner.query(`ALTER TABLE "order_events" DROP COLUMN IF EXISTS "provider_event_id";`);
    await queryRunner.query(`ALTER TABLE "tenant_settings" DROP CONSTRAINT IF EXISTS "CK_tenant_settings_capture_mode";`);
    await queryRunner.query(`ALTER TABLE "tenant_settings" DROP COLUMN IF EXISTS "capture_mode";`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "fulfillment_status";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "shipment_items";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "shipments";`);
  }
}
