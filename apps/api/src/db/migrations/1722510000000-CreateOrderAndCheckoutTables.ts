import { MigrationInterface, QueryRunner } from 'typeorm';
import { enableRls, disableRls } from './helpers/rls.helper';

export class CreateOrderAndCheckoutTables1722510000000
  implements MigrationInterface
{
  name = 'CreateOrderAndCheckoutTables1722510000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Safely drop old initial placeholder tables if they exist
    await queryRunner.query(
      `DROP TABLE IF EXISTS "refunds", "settlements", "payments", "order_events", "order_items", "orders", "tenant_settings" CASCADE;`,
    );

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

    await queryRunner.query(`
      CREATE TABLE "orders" (
        "tenant_id" uuid NOT NULL,
        "id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "customer_id" uuid,
        "customer_email" character varying NOT NULL,
        "status" character varying NOT NULL DEFAULT 'pending_payment',
        "payment_status" character varying NOT NULL DEFAULT 'pending',
        "currency_code" character varying NOT NULL DEFAULT 'USD',
        "total_cents" integer NOT NULL,
        "shipping_address" jsonb NOT NULL,
        "billing_address" jsonb,
        "guest_access_token_hash" character varying,
        "expires_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_orders" PRIMARY KEY ("tenant_id", "id")
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "order_items" (
        "tenant_id" uuid NOT NULL,
        "id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "order_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "variant_id" uuid NOT NULL,
        "product_name" character varying NOT NULL,
        "variant_name" character varying,
        "sku" character varying NOT NULL,
        "unit_price_cents" integer NOT NULL,
        "quantity" integer NOT NULL,
        "total_price_cents" integer NOT NULL,
        CONSTRAINT "PK_order_items" PRIMARY KEY ("tenant_id", "id")
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "order_events" (
        "tenant_id" uuid NOT NULL,
        "id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "order_id" uuid NOT NULL,
        "event_type" character varying NOT NULL,
        "actor_type" character varying NOT NULL,
        "actor_id" character varying,
        "metadata" jsonb,
        CONSTRAINT "PK_order_events" PRIMARY KEY ("tenant_id", "id")
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "payments" (
        "tenant_id" uuid NOT NULL,
        "id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "order_id" uuid NOT NULL,
        "provider" character varying NOT NULL DEFAULT 'mock',
        "provider_transaction_id" character varying,
        "status" character varying NOT NULL DEFAULT 'pending',
        "amount_cents" integer NOT NULL,
        "currency_code" character varying NOT NULL DEFAULT 'USD',
        "raw_response" jsonb,
        CONSTRAINT "PK_payments" PRIMARY KEY ("tenant_id", "id")
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "settlements" (
        "tenant_id" uuid NOT NULL,
        "id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "payment_id" uuid NOT NULL,
        "order_id" uuid NOT NULL,
        "gross_amount_cents" integer NOT NULL,
        "platform_fee_cents" integer NOT NULL,
        "merchant_net_amount_cents" integer NOT NULL,
        "status" character varying NOT NULL DEFAULT 'settled',
        CONSTRAINT "PK_settlements" PRIMARY KEY ("tenant_id", "id")
      );
    `);

    await queryRunner.query(`
      CREATE TABLE "refunds" (
        "tenant_id" uuid NOT NULL,
        "id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "payment_id" uuid NOT NULL,
        "order_id" uuid NOT NULL,
        "amount_cents" integer NOT NULL,
        "reason" character varying,
        "status" character varying NOT NULL DEFAULT 'completed',
        "provider_refund_id" character varying,
        CONSTRAINT "PK_refunds" PRIMARY KEY ("tenant_id", "id")
      );
    `);

    // Enable and force RLS on all 7 tenant tables
    await enableRls(queryRunner, 'tenant_settings');
    await enableRls(queryRunner, 'orders');
    await enableRls(queryRunner, 'order_items');
    await enableRls(queryRunner, 'order_events');
    await enableRls(queryRunner, 'payments');
    await enableRls(queryRunner, 'settlements');
    await enableRls(queryRunner, 'refunds');

    // Add FK constraints
    await queryRunner.query(`
      ALTER TABLE "tenant_settings"
        ADD CONSTRAINT "FK_tenant_settings_tenant"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION;
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
        ADD CONSTRAINT "FK_orders_tenant"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION;
    `);

    await queryRunner.query(`
      ALTER TABLE "order_items"
        ADD CONSTRAINT "FK_order_items_order"
        FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id", "id")
        ON DELETE CASCADE ON UPDATE NO ACTION;
    `);

    await queryRunner.query(`
      ALTER TABLE "order_events"
        ADD CONSTRAINT "FK_order_events_order"
        FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id", "id")
        ON DELETE CASCADE ON UPDATE NO ACTION;
    `);

    await queryRunner.query(`
      ALTER TABLE "payments"
        ADD CONSTRAINT "FK_payments_order"
        FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id", "id")
        ON DELETE CASCADE ON UPDATE NO ACTION;
    `);

    await queryRunner.query(`
      ALTER TABLE "settlements"
        ADD CONSTRAINT "FK_settlements_payment"
        FOREIGN KEY ("tenant_id", "payment_id") REFERENCES "payments"("tenant_id", "id")
        ON DELETE CASCADE ON UPDATE NO ACTION;
    `);

    await queryRunner.query(`
      ALTER TABLE "settlements"
        ADD CONSTRAINT "FK_settlements_order"
        FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id", "id")
        ON DELETE CASCADE ON UPDATE NO ACTION;
    `);

    await queryRunner.query(`
      ALTER TABLE "refunds"
        ADD CONSTRAINT "FK_refunds_payment"
        FOREIGN KEY ("tenant_id", "payment_id") REFERENCES "payments"("tenant_id", "id")
        ON DELETE CASCADE ON UPDATE NO ACTION;
    `);

    await queryRunner.query(`
      ALTER TABLE "refunds"
        ADD CONSTRAINT "FK_refunds_order"
        FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id", "id")
        ON DELETE CASCADE ON UPDATE NO ACTION;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refunds" DROP CONSTRAINT IF EXISTS "FK_refunds_order"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refunds" DROP CONSTRAINT IF EXISTS "FK_refunds_payment"`,
    );
    await queryRunner.query(
      `ALTER TABLE "settlements" DROP CONSTRAINT IF EXISTS "FK_settlements_order"`,
    );
    await queryRunner.query(
      `ALTER TABLE "settlements" DROP CONSTRAINT IF EXISTS "FK_settlements_payment"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "FK_payments_order"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_events" DROP CONSTRAINT IF EXISTS "FK_order_events_order"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT IF EXISTS "FK_order_items_order"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "FK_orders_tenant"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_settings" DROP CONSTRAINT IF EXISTS "FK_tenant_settings_tenant"`,
    );

    await disableRls(queryRunner, 'refunds');
    await disableRls(queryRunner, 'settlements');
    await disableRls(queryRunner, 'payments');
    await disableRls(queryRunner, 'order_events');
    await disableRls(queryRunner, 'order_items');
    await disableRls(queryRunner, 'orders');
    await disableRls(queryRunner, 'tenant_settings');

    await queryRunner.query(`DROP TABLE IF EXISTS "refunds"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "settlements"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "order_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "order_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "orders"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant_settings"`);
  }
}
