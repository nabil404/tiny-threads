import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAllTables1785070807145 implements MigrationInterface {
  name = 'CreateAllTables1785070807145';

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

    // 1. Global tables
    await queryRunner.query(
      `CREATE TABLE "tenants" ("id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" text NOT NULL, "host" text NOT NULL, CONSTRAINT "tenants_host_uq" UNIQUE ("host"), CONSTRAINT "PK_53be67a04681c66b87ee27c9321" PRIMARY KEY ("id"))`,
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

    // 2. Core merchant & catalog tables
    await queryRunner.query(
      `CREATE TABLE "merchant_users" ("tenant_id" uuid NOT NULL, "id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "email" text NOT NULL, "role" text NOT NULL, "locale" text, CONSTRAINT "merchant_users_tenant_email_uq" UNIQUE ("tenant_id", "email"), CONSTRAINT "PK_2b6b4cbf868c3d6859a75b4cb9b" PRIMARY KEY ("tenant_id", "id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "merchant_users_tenant_created_idx" ON "merchant_users" ("tenant_id", "created_at")`,
    );

    await queryRunner.query(
      `CREATE TABLE "products" ("tenant_id" uuid NOT NULL, "id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "title" text NOT NULL, "status" text NOT NULL, CONSTRAINT "PK_680d9a922cfdbc35b488d813438" PRIMARY KEY ("tenant_id", "id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "products_tenant_created_idx" ON "products" ("tenant_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "products_tenant_status_idx" ON "products" ("tenant_id", "status")`,
    );

    await queryRunner.query(
      `CREATE TABLE "product_variants" ("tenant_id" uuid NOT NULL, "id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "product_id" uuid NOT NULL, "sku" text NOT NULL, "price_cents" integer NOT NULL, "stock" integer NOT NULL, "is_default" boolean NOT NULL DEFAULT false, CONSTRAINT "product_variants_tenant_sku_uq" UNIQUE ("tenant_id", "sku"), CONSTRAINT "PK_33758910ed285d63fba137ff44e" PRIMARY KEY ("tenant_id", "id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "product_variants_tenant_product_idx" ON "product_variants" ("tenant_id", "product_id")`,
    );

    await queryRunner.query(
      `CREATE TABLE "categories" ("tenant_id" uuid NOT NULL, "id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "parent_id" uuid, "name" text NOT NULL, "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_3daaffcf03b596d60f8d48190ce" PRIMARY KEY ("tenant_id", "id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "categories_tenant_parent_idx" ON "categories" ("tenant_id", "parent_id")`,
    );

    await queryRunner.query(
      `CREATE TABLE "product_categories" ("created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "tenant_id" uuid NOT NULL, "product_id" uuid NOT NULL, "category_id" uuid NOT NULL, CONSTRAINT "PK_f5988d4624f96e91a669c2b99a5" PRIMARY KEY ("tenant_id", "product_id", "category_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "product_categories_tenant_category_idx" ON "product_categories" ("tenant_id", "category_id")`,
    );

    // 3. Customer & Cart tables
    await queryRunner.query(
      `CREATE TABLE "customers" ("tenant_id" uuid NOT NULL, "id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "email" text NOT NULL, "name" text NOT NULL, CONSTRAINT "customers_tenant_email_uq" UNIQUE ("tenant_id", "email"), CONSTRAINT "PK_9a71d04bf2e8484de2a9a71aa0b" PRIMARY KEY ("tenant_id", "id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "customers_tenant_created_idx" ON "customers" ("tenant_id", "created_at")`,
    );

    await queryRunner.query(
      `CREATE TABLE "customer_addresses" ("tenant_id" uuid NOT NULL, "id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "customer_id" uuid NOT NULL, "first_name" text NOT NULL, "last_name" text NOT NULL, "company" text, "line1" text NOT NULL, "line2" text, "city" text NOT NULL, "state_province" text, "postal_code" text NOT NULL, "country_code" text NOT NULL, "phone" text, "is_default_shipping" boolean NOT NULL DEFAULT false, "is_default_billing" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_770000dcf4189248d5f9ec12f68" PRIMARY KEY ("tenant_id", "id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "customer_addresses_tenant_customer_idx" ON "customer_addresses" ("tenant_id", "customer_id")`,
    );

    await queryRunner.query(
      `CREATE TABLE "carts" ("tenant_id" uuid NOT NULL, "id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "customer_id" uuid, "session_id" text, "status" text NOT NULL, CONSTRAINT "PK_07bddd6deb937753cfc6148779d" PRIMARY KEY ("tenant_id", "id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "carts_tenant_status_idx" ON "carts" ("tenant_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "carts_tenant_customer_idx" ON "carts" ("tenant_id", "customer_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "carts_tenant_session_idx" ON "carts" ("tenant_id", "session_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "carts_tenant_session_active_uidx" ON "carts" ("tenant_id", "session_id") WHERE "status" = 'active' AND "session_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "carts_tenant_customer_active_uidx" ON "carts" ("tenant_id", "customer_id") WHERE "status" = 'active' AND "customer_id" IS NOT NULL`,
    );

    await queryRunner.query(
      `CREATE TABLE "cart_items" ("tenant_id" uuid NOT NULL, "id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "cart_id" uuid NOT NULL, "variant_id" uuid NOT NULL, "qty" integer NOT NULL, CONSTRAINT "cart_items_tenant_cart_variant_uq" UNIQUE ("tenant_id", "cart_id", "variant_id"), CONSTRAINT "PK_e636f764122e16a324aea3dcbb3" PRIMARY KEY ("tenant_id", "id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "cart_items_tenant_cart_idx" ON "cart_items" ("tenant_id", "cart_id")`,
    );

    // 4. Auth & Identity tables
    await queryRunner.query(
      `CREATE TABLE "customer_identities" ("tenant_id" uuid NOT NULL, "id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "customer_id" uuid NOT NULL, "provider" text NOT NULL, "provider_subject" text, "password_hash" text, "email_verified" boolean NOT NULL DEFAULT false, "verification_token_hash" text, "verification_token_expires_at" TIMESTAMP WITH TIME ZONE, "password_reset_token_hash" text, "password_reset_token_expires_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "customer_identities_tenant_customer_provider_uq" UNIQUE ("tenant_id", "customer_id", "provider"), CONSTRAINT "customer_identities_tenant_provider_subject_uq" UNIQUE ("tenant_id", "provider", "provider_subject"), CONSTRAINT "PK_3f9fa79fff931ba91a3f947cb82" PRIMARY KEY ("tenant_id", "id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "customer_identities_tenant_customer_idx" ON "customer_identities" ("tenant_id", "customer_id")`,
    );

    await queryRunner.query(
      `CREATE TABLE "customer_refresh_tokens" ("tenant_id" uuid NOT NULL, "id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "customer_id" uuid NOT NULL, "token_hash" text NOT NULL, "family_id" uuid NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "customer_refresh_tokens_tenant_token_hash_uq" UNIQUE ("tenant_id", "token_hash"), CONSTRAINT "PK_a7dd7118a97d1c4c343b3baeff6" PRIMARY KEY ("tenant_id", "id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "customer_refresh_tokens_tenant_family_idx" ON "customer_refresh_tokens" ("tenant_id", "family_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "customer_refresh_tokens_tenant_customer_idx" ON "customer_refresh_tokens" ("tenant_id", "customer_id")`,
    );

    await queryRunner.query(
      `CREATE TABLE "merchant_user_identities" ("tenant_id" uuid NOT NULL, "id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "merchant_user_id" uuid NOT NULL, "provider" text NOT NULL, "provider_subject" text, "password_hash" text, "email_verified" boolean NOT NULL DEFAULT false, "verification_token_hash" text, "verification_token_expires_at" TIMESTAMP WITH TIME ZONE, "password_reset_token_hash" text, "password_reset_token_expires_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "merchant_user_identities_tenant_merchant_user_provider_uq" UNIQUE ("tenant_id", "merchant_user_id", "provider"), CONSTRAINT "merchant_user_identities_tenant_provider_subject_uq" UNIQUE ("tenant_id", "provider", "provider_subject"), CONSTRAINT "PK_72070e29fd22869fb07a4ee97e1" PRIMARY KEY ("tenant_id", "id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "merchant_user_identities_tenant_merchant_user_idx" ON "merchant_user_identities" ("tenant_id", "merchant_user_id")`,
    );

    await queryRunner.query(
      `CREATE TABLE "merchant_user_refresh_tokens" ("tenant_id" uuid NOT NULL, "id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "merchant_user_id" uuid NOT NULL, "token_hash" text NOT NULL, "family_id" uuid NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "merchant_user_refresh_tokens_tenant_token_hash_uq" UNIQUE ("tenant_id", "token_hash"), CONSTRAINT "PK_4c9e5adc56d416b1fb08882bbb0" PRIMARY KEY ("tenant_id", "id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "merchant_user_refresh_tokens_tenant_family_idx" ON "merchant_user_refresh_tokens" ("tenant_id", "family_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "merchant_user_refresh_tokens_tenant_merchant_user_idx" ON "merchant_user_refresh_tokens" ("tenant_id", "merchant_user_id")`,
    );

    await queryRunner.query(
      `CREATE TABLE "merchant_user_invites" ("tenant_id" uuid NOT NULL, "id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "email" text NOT NULL, "role" text NOT NULL, "token_hash" text NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE, "invited_by_merchant_user_id" uuid, CONSTRAINT "merchant_user_invites_tenant_token_hash_uq" UNIQUE ("tenant_id", "token_hash"), CONSTRAINT "PK_16e728cb2efbef132b6e004c9da" PRIMARY KEY ("tenant_id", "id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "merchant_user_invites_tenant_email_idx" ON "merchant_user_invites" ("tenant_id", "email")`,
    );

    // 5. Settings & Config tables
    await queryRunner.query(
      `CREATE TABLE "payment_provider_configs" ("tenant_id" uuid NOT NULL, "id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "provider_code" text NOT NULL, "account_ref" text NOT NULL, "enabled" boolean NOT NULL, CONSTRAINT "PK_729dc735a740206978bb9902b97" PRIMARY KEY ("tenant_id", "id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "payment_provider_configs_tenant_provider_idx" ON "payment_provider_configs" ("tenant_id", "provider_code")`,
    );

    await queryRunner.query(`
      CREATE TABLE "tenant_settings" (
        "tenant_id" uuid NOT NULL,
        "id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "allow_guest_checkout" boolean NOT NULL DEFAULT true,
        "platform_fee_percent" numeric(5,2) NOT NULL DEFAULT 2.50,
        "default_currency_code" text NOT NULL DEFAULT 'USD',
        "capture_mode" varchar(50) NOT NULL DEFAULT 'immediate',
        CONSTRAINT "CK_tenant_settings_capture_mode" CHECK ("capture_mode" IN ('immediate', 'authorize_then_capture')),
        CONSTRAINT "PK_tenant_settings" PRIMARY KEY ("tenant_id", "id")
      );
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "tenant_settings_tenant_uidx" ON "tenant_settings" ("tenant_id")`,
    );

    // 6. Orders, Payments, Settlements & Refunds tables
    await queryRunner.query(`
      CREATE TABLE "orders" (
        "tenant_id" uuid NOT NULL,
        "id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "customer_id" uuid,
        "customer_email" character varying NOT NULL,
        "status" character varying NOT NULL DEFAULT 'pending',
        "payment_status" character varying NOT NULL DEFAULT 'pending',
        "fulfillment_status" varchar(50) NOT NULL DEFAULT 'unfulfilled',
        "currency_code" character varying NOT NULL DEFAULT 'USD',
        "total_cents" integer NOT NULL,
        "shipping_address" jsonb NOT NULL,
        "billing_address" jsonb,
        "guest_access_token_hash" character varying,
        "expires_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_orders" PRIMARY KEY ("tenant_id", "id")
      );
    `);
    await queryRunner.query(
      `CREATE INDEX "orders_tenant_customer_created_idx" ON "orders" ("tenant_id", "customer_id", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "orders_tenant_status_created_idx" ON "orders" ("tenant_id", "status", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "orders_tenant_created_idx" ON "orders" ("tenant_id", "created_at" DESC)`,
    );

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
    await queryRunner.query(
      `CREATE INDEX "order_items_tenant_order_idx" ON "order_items" ("tenant_id", "order_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "order_events" (
        "tenant_id" uuid NOT NULL,
        "id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "order_id" uuid,
        "event_type" character varying NOT NULL,
        "actor_type" character varying NOT NULL,
        "actor_id" character varying,
        "metadata" jsonb,
        "provider_event_id" varchar(255),
        CONSTRAINT "PK_order_events" PRIMARY KEY ("tenant_id", "id")
      );
    `);
    await queryRunner.query(
      `CREATE INDEX "order_events_tenant_order_created_idx" ON "order_events" ("tenant_id", "order_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "order_events_tenant_provider_event_uidx" ON "order_events" ("tenant_id", "provider_event_id") WHERE "provider_event_id" IS NOT NULL`,
    );

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
    await queryRunner.query(
      `CREATE INDEX "payments_tenant_order_status_idx" ON "payments" ("tenant_id", "order_id", "status")`,
    );

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
    await queryRunner.query(
      `CREATE INDEX "settlements_tenant_payment_idx" ON "settlements" ("tenant_id", "payment_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "settlements_tenant_order_idx" ON "settlements" ("tenant_id", "order_id")`,
    );

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
    await queryRunner.query(
      `CREATE INDEX "refunds_tenant_payment_idx" ON "refunds" ("tenant_id", "payment_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "refunds_tenant_order_idx" ON "refunds" ("tenant_id", "order_id")`,
    );

    // 7. Fulfillment tables
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
        CONSTRAINT "PK_shipments" PRIMARY KEY ("tenant_id", "id")
      );
    `);
    await queryRunner.query(
      `CREATE INDEX "shipments_tenant_order_idx" ON "shipments" ("tenant_id", "order_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "shipment_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v7(),
        "tenant_id" uuid NOT NULL,
        "shipment_id" uuid NOT NULL,
        "order_item_id" uuid NOT NULL,
        "quantity" integer NOT NULL CHECK ("quantity" > 0),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_shipment_items" PRIMARY KEY ("tenant_id", "id")
      );
    `);
    await queryRunner.query(
      `CREATE INDEX "shipment_items_tenant_shipment_idx" ON "shipment_items" ("tenant_id", "shipment_id")`,
    );

    // 8. Foreign Key Constraints
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
    await queryRunner.query(
      `ALTER TABLE "customer_identities" ADD CONSTRAINT "FK_1a0f0a082d4fbbdd87bc70e8b00" FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "customers"("tenant_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_refresh_tokens" ADD CONSTRAINT "FK_88686866597cbbbe573c66c5266" FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "customers"("tenant_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "merchant_user_identities" ADD CONSTRAINT "FK_0d1049205306bf90743482f6ccf" FOREIGN KEY ("tenant_id", "merchant_user_id") REFERENCES "merchant_users"("tenant_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "merchant_user_refresh_tokens" ADD CONSTRAINT "FK_ce86db17d89f4c1ce5b4d5c60c7" FOREIGN KEY ("tenant_id", "merchant_user_id") REFERENCES "merchant_users"("tenant_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "merchant_user_invites" ADD CONSTRAINT "FK_011dcb4f39eb8cdc951430f946f" FOREIGN KEY ("tenant_id", "invited_by_merchant_user_id") REFERENCES "merchant_users"("tenant_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_settings" ADD CONSTRAINT "FK_tenant_settings_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_settings" ADD CONSTRAINT "FK_tenant_settings_default_currency_code" FOREIGN KEY ("default_currency_code") REFERENCES "currencies"("code") ON UPDATE CASCADE ON DELETE RESTRICT`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_orders_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_order_items_order" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_events" ADD CONSTRAINT "FK_order_events_order" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_payments_order" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "settlements" ADD CONSTRAINT "FK_settlements_payment" FOREIGN KEY ("tenant_id", "payment_id") REFERENCES "payments"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "settlements" ADD CONSTRAINT "FK_settlements_order" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "refunds" ADD CONSTRAINT "FK_refunds_payment" FOREIGN KEY ("tenant_id", "payment_id") REFERENCES "payments"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "refunds" ADD CONSTRAINT "FK_refunds_order" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipments" ADD CONSTRAINT "FK_shipments_tenants" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipments" ADD CONSTRAINT "FK_shipments_orders" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id", "id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipment_items" ADD CONSTRAINT "FK_shipment_items_tenants" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipment_items" ADD CONSTRAINT "FK_shipment_items_shipments" FOREIGN KEY ("tenant_id", "shipment_id") REFERENCES "shipments"("tenant_id", "id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipment_items" ADD CONSTRAINT "FK_shipment_items_order_items" FOREIGN KEY ("tenant_id", "order_item_id") REFERENCES "order_items"("tenant_id", "id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys
    await queryRunner.query(
      `ALTER TABLE "shipment_items" DROP CONSTRAINT IF EXISTS "FK_shipment_items_order_items"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipment_items" DROP CONSTRAINT IF EXISTS "FK_shipment_items_shipments"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipment_items" DROP CONSTRAINT IF EXISTS "FK_shipment_items_tenants"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipments" DROP CONSTRAINT IF EXISTS "FK_shipments_orders"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipments" DROP CONSTRAINT IF EXISTS "FK_shipments_tenants"`,
    );
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
      `ALTER TABLE "tenant_settings" DROP CONSTRAINT IF EXISTS "FK_tenant_settings_default_currency_code"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenant_settings" DROP CONSTRAINT IF EXISTS "FK_tenant_settings_tenant"`,
    );
    await queryRunner.query(
      `ALTER TABLE "merchant_user_invites" DROP CONSTRAINT IF EXISTS "FK_011dcb4f39eb8cdc951430f946f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "merchant_user_refresh_tokens" DROP CONSTRAINT IF EXISTS "FK_ce86db17d89f4c1ce5b4d5c60c7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "merchant_user_identities" DROP CONSTRAINT IF EXISTS "FK_0d1049205306bf90743482f6ccf"`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_refresh_tokens" DROP CONSTRAINT IF EXISTS "FK_88686866597cbbbe573c66c5266"`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_identities" DROP CONSTRAINT IF EXISTS "FK_1a0f0a082d4fbbdd87bc70e8b00"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_provider_configs" DROP CONSTRAINT IF EXISTS "FK_5e368caebde794591c88245381d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_provider_configs" DROP CONSTRAINT IF EXISTS "FK_274361e3ce861e3b2b1f4b8198c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "carts" DROP CONSTRAINT IF EXISTS "FK_d25e14ac78a3d598d649737b5b8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_items" DROP CONSTRAINT IF EXISTS "FK_f911a44380dc0ecbb4ed503dc93"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_items" DROP CONSTRAINT IF EXISTS "FK_97c9c98220ac3ded39bd71b979a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_addresses" DROP CONSTRAINT IF EXISTS "FK_232cae5ae13b588f3244bfd7ab0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_addresses" DROP CONSTRAINT IF EXISTS "FK_580c2c7ffb9e8cc9bfb35c5f41f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "customers" DROP CONSTRAINT IF EXISTS "FK_97913f35ac2e435a4463fb50a01"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_categories" DROP CONSTRAINT IF EXISTS "FK_a8bec7f67633ae5fe2e312c1ac1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_categories" DROP CONSTRAINT IF EXISTS "FK_013adf31be45fc744c43fce15a6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" DROP CONSTRAINT IF EXISTS "FK_b43e7c0396e495d1b8ac8eaeded"`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" DROP CONSTRAINT IF EXISTS "FK_5d4fe23b360b1b9e16a3f41727f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "FK_9c365ebf78f0e8a6d9e4827ea70"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_variants" DROP CONSTRAINT IF EXISTS "FK_631868eaa78af7cf2bd30b092e7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "merchant_users" DROP CONSTRAINT IF EXISTS "FK_c2a0472c4668424117af722f058"`,
    );

    // Drop tables
    await queryRunner.query(`DROP TABLE IF EXISTS "shipment_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "shipments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refunds"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "settlements"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "order_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "order_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "orders"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant_settings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_provider_configs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "merchant_user_invites"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "merchant_user_refresh_tokens"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "merchant_user_identities"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "customer_refresh_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "customer_identities"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cart_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "carts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "customer_addresses"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "customers"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product_categories"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "categories"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "product_variants"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "products"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "merchant_users"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_providers"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "countries"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "currencies"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "platform_admins"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenants"`);

    // Drop function
    await queryRunner.query(`DROP FUNCTION IF EXISTS uuid_generate_v7()`);
  }
}
