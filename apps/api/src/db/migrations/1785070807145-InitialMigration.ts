import { MigrationInterface, QueryRunner } from 'typeorm';
import { enableRls, disableRls } from './helpers/rls.helper';

export class InitialMigration1785070807145 implements MigrationInterface {
  name = 'InitialMigration1785070807145';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "tenants" ("id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" text NOT NULL, "slug" text NOT NULL, CONSTRAINT "UQ_2310ecc5cb8be427097154b18fc" UNIQUE ("slug"), CONSTRAINT "PK_53be67a04681c66b87ee27c9321" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "platform_admins" ("id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "email" text NOT NULL, "role" text NOT NULL, CONSTRAINT "platform_admins_email_uq" UNIQUE ("email"), CONSTRAINT "PK_faecb3398d1962507b44c76e4f0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "currencies" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "code" text NOT NULL, "name" text NOT NULL, "symbol" text NOT NULL, CONSTRAINT "PK_9f8d0972aeeb5a2277e40332d29" PRIMARY KEY ("code"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "countries" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "code" text NOT NULL, "name" text NOT NULL, CONSTRAINT "PK_b47cbb5311bad9c9ae17b8c1eda" PRIMARY KEY ("code"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "payment_providers" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "code" text NOT NULL, "name" text NOT NULL, "supports_split" boolean NOT NULL, CONSTRAINT "PK_3b92bdeea5c610e84052154ef25" PRIMARY KEY ("code"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "merchant_users" ("tenant_id" uuid NOT NULL, "id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "email" text NOT NULL, "role" text NOT NULL, CONSTRAINT "merchant_users_tenant_email_uq" UNIQUE ("tenant_id", "email"), CONSTRAINT "PK_2b6b4cbf868c3d6859a75b4cb9b" PRIMARY KEY ("tenant_id", "id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "merchant_users_tenant_created_idx" ON "merchant_users"  ("tenant_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "product_variants" ("tenant_id" uuid NOT NULL, "id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "product_id" uuid NOT NULL, "sku" text NOT NULL, "price_cents" integer NOT NULL, "stock" integer NOT NULL, "is_default" boolean NOT NULL DEFAULT false, CONSTRAINT "product_variants_tenant_sku_uq" UNIQUE ("tenant_id", "sku"), CONSTRAINT "PK_33758910ed285d63fba137ff44e" PRIMARY KEY ("tenant_id", "id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "product_variants_tenant_product_idx" ON "product_variants"  ("tenant_id", "product_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "categories" ("tenant_id" uuid NOT NULL, "id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "parent_id" uuid, "name" text NOT NULL, CONSTRAINT "PK_3daaffcf03b596d60f8d48190ce" PRIMARY KEY ("tenant_id", "id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "categories_tenant_parent_idx" ON "categories"  ("tenant_id", "parent_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "product_categories" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "tenant_id" uuid NOT NULL, "product_id" uuid NOT NULL, "category_id" uuid NOT NULL, CONSTRAINT "PK_f5988d4624f96e91a669c2b99a5" PRIMARY KEY ("tenant_id", "product_id", "category_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "product_categories_tenant_category_idx" ON "product_categories"  ("tenant_id", "category_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "products" ("tenant_id" uuid NOT NULL, "id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "title" text NOT NULL, "status" text NOT NULL, CONSTRAINT "PK_680d9a922cfdbc35b488d813438" PRIMARY KEY ("tenant_id", "id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "products_tenant_created_idx" ON "products"  ("tenant_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "products_tenant_status_idx" ON "products"  ("tenant_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "customers" ("tenant_id" uuid NOT NULL, "id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "email" text NOT NULL, "name" text NOT NULL, CONSTRAINT "customers_tenant_email_uq" UNIQUE ("tenant_id", "email"), CONSTRAINT "PK_9a71d04bf2e8484de2a9a71aa0b" PRIMARY KEY ("tenant_id", "id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "customers_tenant_created_idx" ON "customers"  ("tenant_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "customer_addresses" ("tenant_id" uuid NOT NULL, "id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "customer_id" uuid NOT NULL, "line1" text NOT NULL, "country_code" text NOT NULL, CONSTRAINT "PK_770000dcf4189248d5f9ec12f68" PRIMARY KEY ("tenant_id", "id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "customer_addresses_tenant_customer_idx" ON "customer_addresses"  ("tenant_id", "customer_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "cart_items" ("tenant_id" uuid NOT NULL, "id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "cart_id" uuid NOT NULL, "variant_id" uuid NOT NULL, "qty" integer NOT NULL, CONSTRAINT "cart_items_tenant_cart_variant_uq" UNIQUE ("tenant_id", "cart_id", "variant_id"), CONSTRAINT "PK_e636f764122e16a324aea3dcbb3" PRIMARY KEY ("tenant_id", "id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "cart_items_tenant_cart_idx" ON "cart_items"  ("tenant_id", "cart_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "carts" ("tenant_id" uuid NOT NULL, "id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "customer_id" uuid NOT NULL, "status" text NOT NULL, CONSTRAINT "PK_07bddd6deb937753cfc6148779d" PRIMARY KEY ("tenant_id", "id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "carts_tenant_status_idx" ON "carts"  ("tenant_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "carts_tenant_customer_idx" ON "carts"  ("tenant_id", "customer_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "order_items" ("tenant_id" uuid NOT NULL, "id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "order_id" uuid NOT NULL, "variant_id" uuid NOT NULL, "name_snapshot" text NOT NULL, "price_cents_snapshot" integer NOT NULL, "qty" integer NOT NULL, CONSTRAINT "PK_661da2f11c9f2d00555e41b6a0e" PRIMARY KEY ("tenant_id", "id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "order_items_tenant_order_idx" ON "order_items"  ("tenant_id", "order_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "order_events" ("tenant_id" uuid NOT NULL, "id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "order_id" uuid NOT NULL, "type" text NOT NULL, "provider_event_id" text, "payload" jsonb NOT NULL, CONSTRAINT "order_events_tenant_provider_event_uq" UNIQUE ("tenant_id", "provider_event_id"), CONSTRAINT "PK_33e5f32725ad3f382b4b1362c5d" PRIMARY KEY ("tenant_id", "id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "order_events_tenant_created_idx" ON "order_events"  ("tenant_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "order_events_tenant_order_idx" ON "order_events"  ("tenant_id", "order_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "payment_provider_configs" ("tenant_id" uuid NOT NULL, "id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "provider_code" text NOT NULL, "account_ref" text NOT NULL, "enabled" boolean NOT NULL, CONSTRAINT "PK_729dc735a740206978bb9902b97" PRIMARY KEY ("tenant_id", "id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "payment_provider_configs_tenant_provider_idx" ON "payment_provider_configs"  ("tenant_id", "provider_code") `,
    );
    await queryRunner.query(
      `CREATE TABLE "settlements" ("tenant_id" uuid NOT NULL, "id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "payment_id" uuid NOT NULL, "merchant_cents" integer NOT NULL, "platform_fee_cents" integer NOT NULL, "status" text NOT NULL, CONSTRAINT "settlements_tenant_payment_uq" UNIQUE ("tenant_id", "payment_id"), CONSTRAINT "REL_c514bae19e2b3aceb048f7f013" UNIQUE ("tenant_id", "payment_id"), CONSTRAINT "PK_7d0123be74415469a7f67e592c9" PRIMARY KEY ("tenant_id", "id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "payments" ("tenant_id" uuid NOT NULL, "id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "order_id" uuid NOT NULL, "provider_config_id" uuid NOT NULL, "amount_cents" integer NOT NULL, "status" text NOT NULL, CONSTRAINT "PK_bf16bf1d8e3a222bc1131fa3506" PRIMARY KEY ("tenant_id", "id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "payments_tenant_order_idx" ON "payments"  ("tenant_id", "order_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "orders" ("tenant_id" uuid NOT NULL, "id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "number" text NOT NULL, "customer_id" uuid NOT NULL, "currency_code" text NOT NULL, "status" text NOT NULL, "payment_status" text NOT NULL, "total_cents" integer NOT NULL, CONSTRAINT "orders_tenant_number_uq" UNIQUE ("tenant_id", "number"), CONSTRAINT "PK_c218c0315dc545f5b012e4bf391" PRIMARY KEY ("tenant_id", "id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "orders_tenant_created_idx" ON "orders"  ("tenant_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "refunds" ("tenant_id" uuid NOT NULL, "id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "payment_id" uuid NOT NULL, "settlement_id" uuid NOT NULL, "amount_cents" integer NOT NULL, CONSTRAINT "PK_07348aec75d60e15d2943d09891" PRIMARY KEY ("tenant_id", "id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "refunds_tenant_settlement_idx" ON "refunds"  ("tenant_id", "settlement_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "refunds_tenant_payment_idx" ON "refunds"  ("tenant_id", "payment_id") `,
    );

    // RLS must be enabled before the FK constraints below are added: FK
    // validation scans the referencing table, and with FORCE ROW LEVEL
    // SECURITY that scan is itself subject to the tenant_isolation policy.
    await enableRls(queryRunner, 'merchant_users');
    await enableRls(queryRunner, 'product_variants');
    await enableRls(queryRunner, 'categories');
    await enableRls(queryRunner, 'product_categories');
    await enableRls(queryRunner, 'products');
    await enableRls(queryRunner, 'customers');
    await enableRls(queryRunner, 'customer_addresses');
    await enableRls(queryRunner, 'cart_items');
    await enableRls(queryRunner, 'carts');
    await enableRls(queryRunner, 'order_items');
    await enableRls(queryRunner, 'order_events');
    await enableRls(queryRunner, 'payment_provider_configs');
    await enableRls(queryRunner, 'settlements');
    await enableRls(queryRunner, 'payments');
    await enableRls(queryRunner, 'orders');
    await enableRls(queryRunner, 'refunds');

    await queryRunner.query(
      `ALTER TABLE "merchant_users" ADD CONSTRAINT "FK_c2a0472c4668424117af722f058" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_variants" ADD CONSTRAINT "FK_631868eaa78af7cf2bd30b092e7" FOREIGN KEY ("tenant_id", "product_id") REFERENCES "products"("tenant_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" ADD CONSTRAINT "FK_5d4fe23b360b1b9e16a3f41727f" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" ADD CONSTRAINT "FK_b43e7c0396e495d1b8ac8eaeded" FOREIGN KEY ("tenant_id", "parent_id") REFERENCES "categories"("tenant_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_categories" ADD CONSTRAINT "FK_013adf31be45fc744c43fce15a6" FOREIGN KEY ("tenant_id", "product_id") REFERENCES "products"("tenant_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_categories" ADD CONSTRAINT "FK_a8bec7f67633ae5fe2e312c1ac1" FOREIGN KEY ("tenant_id", "category_id") REFERENCES "categories"("tenant_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "FK_9c365ebf78f0e8a6d9e4827ea70" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "customers" ADD CONSTRAINT "FK_97913f35ac2e435a4463fb50a01" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_addresses" ADD CONSTRAINT "FK_580c2c7ffb9e8cc9bfb35c5f41f" FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "customers"("tenant_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_addresses" ADD CONSTRAINT "FK_232cae5ae13b588f3244bfd7ab0" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_items" ADD CONSTRAINT "FK_97c9c98220ac3ded39bd71b979a" FOREIGN KEY ("tenant_id", "cart_id") REFERENCES "carts"("tenant_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_items" ADD CONSTRAINT "FK_f911a44380dc0ecbb4ed503dc93" FOREIGN KEY ("tenant_id", "variant_id") REFERENCES "product_variants"("tenant_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "carts" ADD CONSTRAINT "FK_d25e14ac78a3d598d649737b5b8" FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "customers"("tenant_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_130af2b40e6c3d2b7fa6a802547" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_c6f0cc5e525f3f813b25f9cd7bf" FOREIGN KEY ("tenant_id", "variant_id") REFERENCES "product_variants"("tenant_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_events" ADD CONSTRAINT "FK_178a16ac37812e8f26f40e2f625" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_provider_configs" ADD CONSTRAINT "FK_274361e3ce861e3b2b1f4b8198c" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_provider_configs" ADD CONSTRAINT "FK_5e368caebde794591c88245381d" FOREIGN KEY ("provider_code") REFERENCES "payment_providers"("code") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "settlements" ADD CONSTRAINT "FK_c514bae19e2b3aceb048f7f0134" FOREIGN KEY ("tenant_id", "payment_id") REFERENCES "payments"("tenant_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_eb2d3668c3e7744fd4daebbcd06" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_68f47a2d690a76b1b02fe7638b4" FOREIGN KEY ("tenant_id", "provider_config_id") REFERENCES "payment_provider_configs"("tenant_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_d659290ef65a9ce29de3d437238" FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "customers"("tenant_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_5ad51399a06814ff8c87f0f04d8" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "refunds" ADD CONSTRAINT "FK_990295079ce8691c5edeaa13553" FOREIGN KEY ("tenant_id", "payment_id") REFERENCES "payments"("tenant_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "refunds" ADD CONSTRAINT "FK_f02f0723a9905aae463a800ef61" FOREIGN KEY ("tenant_id", "settlement_id") REFERENCES "settlements"("tenant_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refunds" DROP CONSTRAINT "FK_f02f0723a9905aae463a800ef61"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refunds" DROP CONSTRAINT "FK_990295079ce8691c5edeaa13553"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_5ad51399a06814ff8c87f0f04d8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_d659290ef65a9ce29de3d437238"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "FK_68f47a2d690a76b1b02fe7638b4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "FK_eb2d3668c3e7744fd4daebbcd06"`,
    );
    await queryRunner.query(
      `ALTER TABLE "settlements" DROP CONSTRAINT "FK_c514bae19e2b3aceb048f7f0134"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_provider_configs" DROP CONSTRAINT "FK_5e368caebde794591c88245381d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_provider_configs" DROP CONSTRAINT "FK_274361e3ce861e3b2b1f4b8198c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_events" DROP CONSTRAINT "FK_178a16ac37812e8f26f40e2f625"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_c6f0cc5e525f3f813b25f9cd7bf"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_130af2b40e6c3d2b7fa6a802547"`,
    );
    await queryRunner.query(
      `ALTER TABLE "carts" DROP CONSTRAINT "FK_d25e14ac78a3d598d649737b5b8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_items" DROP CONSTRAINT "FK_f911a44380dc0ecbb4ed503dc93"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_items" DROP CONSTRAINT "FK_97c9c98220ac3ded39bd71b979a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_addresses" DROP CONSTRAINT "FK_232cae5ae13b588f3244bfd7ab0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_addresses" DROP CONSTRAINT "FK_580c2c7ffb9e8cc9bfb35c5f41f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "customers" DROP CONSTRAINT "FK_97913f35ac2e435a4463fb50a01"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT "FK_9c365ebf78f0e8a6d9e4827ea70"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_categories" DROP CONSTRAINT "FK_a8bec7f67633ae5fe2e312c1ac1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_categories" DROP CONSTRAINT "FK_013adf31be45fc744c43fce15a6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" DROP CONSTRAINT "FK_b43e7c0396e495d1b8ac8eaeded"`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" DROP CONSTRAINT "FK_5d4fe23b360b1b9e16a3f41727f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_variants" DROP CONSTRAINT "FK_631868eaa78af7cf2bd30b092e7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "merchant_users" DROP CONSTRAINT "FK_c2a0472c4668424117af722f058"`,
    );

    await disableRls(queryRunner, 'refunds');
    await disableRls(queryRunner, 'orders');
    await disableRls(queryRunner, 'payments');
    await disableRls(queryRunner, 'settlements');
    await disableRls(queryRunner, 'payment_provider_configs');
    await disableRls(queryRunner, 'order_events');
    await disableRls(queryRunner, 'order_items');
    await disableRls(queryRunner, 'carts');
    await disableRls(queryRunner, 'cart_items');
    await disableRls(queryRunner, 'customer_addresses');
    await disableRls(queryRunner, 'customers');
    await disableRls(queryRunner, 'products');
    await disableRls(queryRunner, 'product_categories');
    await disableRls(queryRunner, 'categories');
    await disableRls(queryRunner, 'product_variants');
    await disableRls(queryRunner, 'merchant_users');

    await queryRunner.query(`DROP INDEX "public"."refunds_tenant_payment_idx"`);
    await queryRunner.query(
      `DROP INDEX "public"."refunds_tenant_settlement_idx"`,
    );
    await queryRunner.query(`DROP TABLE "refunds"`);
    await queryRunner.query(`DROP INDEX "public"."orders_tenant_created_idx"`);
    await queryRunner.query(`DROP TABLE "orders"`);
    await queryRunner.query(`DROP INDEX "public"."payments_tenant_order_idx"`);
    await queryRunner.query(`DROP TABLE "payments"`);
    await queryRunner.query(`DROP TABLE "settlements"`);
    await queryRunner.query(
      `DROP INDEX "public"."payment_provider_configs_tenant_provider_idx"`,
    );
    await queryRunner.query(`DROP TABLE "payment_provider_configs"`);
    await queryRunner.query(
      `DROP INDEX "public"."order_events_tenant_order_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."order_events_tenant_created_idx"`,
    );
    await queryRunner.query(`DROP TABLE "order_events"`);
    await queryRunner.query(
      `DROP INDEX "public"."order_items_tenant_order_idx"`,
    );
    await queryRunner.query(`DROP TABLE "order_items"`);
    await queryRunner.query(`DROP INDEX "public"."carts_tenant_customer_idx"`);
    await queryRunner.query(`DROP INDEX "public"."carts_tenant_status_idx"`);
    await queryRunner.query(`DROP TABLE "carts"`);
    await queryRunner.query(`DROP INDEX "public"."cart_items_tenant_cart_idx"`);
    await queryRunner.query(`DROP TABLE "cart_items"`);
    await queryRunner.query(
      `DROP INDEX "public"."customer_addresses_tenant_customer_idx"`,
    );
    await queryRunner.query(`DROP TABLE "customer_addresses"`);
    await queryRunner.query(
      `DROP INDEX "public"."customers_tenant_created_idx"`,
    );
    await queryRunner.query(`DROP TABLE "customers"`);
    await queryRunner.query(`DROP INDEX "public"."products_tenant_status_idx"`);
    await queryRunner.query(
      `DROP INDEX "public"."products_tenant_created_idx"`,
    );
    await queryRunner.query(`DROP TABLE "products"`);
    await queryRunner.query(
      `DROP INDEX "public"."product_categories_tenant_category_idx"`,
    );
    await queryRunner.query(`DROP TABLE "product_categories"`);
    await queryRunner.query(
      `DROP INDEX "public"."categories_tenant_parent_idx"`,
    );
    await queryRunner.query(`DROP TABLE "categories"`);
    await queryRunner.query(
      `DROP INDEX "public"."product_variants_tenant_product_idx"`,
    );
    await queryRunner.query(`DROP TABLE "product_variants"`);
    await queryRunner.query(
      `DROP INDEX "public"."merchant_users_tenant_created_idx"`,
    );
    await queryRunner.query(`DROP TABLE "merchant_users"`);
    await queryRunner.query(`DROP TABLE "payment_providers"`);
    await queryRunner.query(`DROP TABLE "countries"`);
    await queryRunner.query(`DROP TABLE "currencies"`);
    await queryRunner.query(`DROP TABLE "platform_admins"`);
    await queryRunner.query(`DROP TABLE "tenants"`);
  }
}
