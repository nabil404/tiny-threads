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
      `CREATE TABLE "payment_provider_configs" ("tenant_id" uuid NOT NULL, "id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "provider_code" text NOT NULL, "account_ref" text NOT NULL, "enabled" boolean NOT NULL, CONSTRAINT "PK_729dc735a740206978bb9902b97" PRIMARY KEY ("tenant_id", "id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "payment_provider_configs_tenant_provider_idx" ON "payment_provider_configs"  ("tenant_id", "provider_code") `,
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
    await enableRls(queryRunner, 'payment_provider_configs');

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
      `ALTER TABLE "payment_provider_configs" ADD CONSTRAINT "FK_274361e3ce861e3b2b1f4b8198c" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_provider_configs" ADD CONSTRAINT "FK_5e368caebde794591c88245381d" FOREIGN KEY ("provider_code") REFERENCES "payment_providers"("code") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payment_provider_configs" DROP CONSTRAINT "FK_5e368caebde794591c88245381d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_provider_configs" DROP CONSTRAINT "FK_274361e3ce861e3b2b1f4b8198c"`,
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

    await disableRls(queryRunner, 'payment_provider_configs');
    await disableRls(queryRunner, 'carts');
    await disableRls(queryRunner, 'cart_items');
    await disableRls(queryRunner, 'customer_addresses');
    await disableRls(queryRunner, 'customers');
    await disableRls(queryRunner, 'products');
    await disableRls(queryRunner, 'product_categories');
    await disableRls(queryRunner, 'categories');
    await disableRls(queryRunner, 'product_variants');
    await disableRls(queryRunner, 'merchant_users');

    await queryRunner.query(
      `DROP INDEX "public"."payment_provider_configs_tenant_provider_idx"`,
    );
    await queryRunner.query(`DROP TABLE "payment_provider_configs"`);
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
