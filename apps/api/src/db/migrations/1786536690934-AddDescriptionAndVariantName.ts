import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDescriptionAndVariantName1786536690934 implements MigrationInterface {
    name = 'AddDescriptionAndVariantName1786536690934'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product_variant_images" DROP CONSTRAINT "product_variant_images_variant_fkey"`);
        await queryRunner.query(`ALTER TABLE "product_variant_images" DROP CONSTRAINT "product_variant_images_tenant_fkey"`);
        await queryRunner.query(`ALTER TABLE "tenant_settings" DROP CONSTRAINT "FK_tenant_settings_default_currency_code"`);
        await queryRunner.query(`ALTER TABLE "tenant_settings" DROP CONSTRAINT "FK_tenant_settings_tenant"`);
        await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT "FK_order_items_order"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "FK_orders_tenant"`);
        await queryRunner.query(`ALTER TABLE "order_events" DROP CONSTRAINT "FK_order_events_order"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_payments_order"`);
        await queryRunner.query(`ALTER TABLE "settlements" DROP CONSTRAINT "FK_settlements_order"`);
        await queryRunner.query(`ALTER TABLE "settlements" DROP CONSTRAINT "FK_settlements_payment"`);
        await queryRunner.query(`ALTER TABLE "refunds" DROP CONSTRAINT "FK_refunds_order"`);
        await queryRunner.query(`ALTER TABLE "refunds" DROP CONSTRAINT "FK_refunds_payment"`);
        await queryRunner.query(`ALTER TABLE "shipment_items" DROP CONSTRAINT "FK_shipment_items_order_items"`);
        await queryRunner.query(`ALTER TABLE "shipment_items" DROP CONSTRAINT "FK_shipment_items_shipments"`);
        await queryRunner.query(`ALTER TABLE "shipment_items" DROP CONSTRAINT "FK_shipment_items_tenants"`);
        await queryRunner.query(`ALTER TABLE "shipments" DROP CONSTRAINT "FK_shipments_orders"`);
        await queryRunner.query(`ALTER TABLE "shipments" DROP CONSTRAINT "FK_shipments_tenants"`);
        await queryRunner.query(`DROP INDEX "public"."order_events_tenant_provider_event_uidx"`);
        await queryRunner.query(`ALTER TABLE "tenant_settings" DROP CONSTRAINT "CK_tenant_settings_capture_mode"`);
        await queryRunner.query(`ALTER TABLE "shipment_items" DROP CONSTRAINT "shipment_items_quantity_check"`);
        await queryRunner.query(`ALTER TABLE "product_variants" ADD "name" text`);
        await queryRunner.query(`ALTER TABLE "products" ADD "description" text`);
        await queryRunner.query(`ALTER TABLE "product_variant_images" ALTER COLUMN "id" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "tenant_settings" ALTER COLUMN "platform_fee_percent" SET DEFAULT '2.5'`);
        await queryRunner.query(`DROP INDEX "public"."orders_tenant_status_created_idx"`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'pending_payment'`);
        await queryRunner.query(`ALTER TABLE "shipment_items" ALTER COLUMN "id" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "shipments" ALTER COLUMN "id" DROP DEFAULT`);
        await queryRunner.query(`CREATE INDEX "orders_tenant_status_created_idx" ON "orders"  ("tenant_id", "status", "created_at") `);
        await queryRunner.query(`ALTER TABLE "product_variant_images" ADD CONSTRAINT "FK_db99b623e16b33583afcad66a40" FOREIGN KEY ("tenant_id", "variant_id") REFERENCES "product_variants"("tenant_id","id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_items" ADD CONSTRAINT "FK_130af2b40e6c3d2b7fa6a802547" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_events" ADD CONSTRAINT "FK_178a16ac37812e8f26f40e2f625" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_eb2d3668c3e7744fd4daebbcd06" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "settlements" ADD CONSTRAINT "FK_c514bae19e2b3aceb048f7f0134" FOREIGN KEY ("tenant_id", "payment_id") REFERENCES "payments"("tenant_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "settlements" ADD CONSTRAINT "FK_e1df982d65628c054a2125246c4" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "refunds" ADD CONSTRAINT "FK_990295079ce8691c5edeaa13553" FOREIGN KEY ("tenant_id", "payment_id") REFERENCES "payments"("tenant_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "refunds" ADD CONSTRAINT "FK_0d9890dda3fb237b8609780fa73" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "shipment_items" ADD CONSTRAINT "FK_f394be4ca65d54625f497343af9" FOREIGN KEY ("tenant_id", "shipment_id") REFERENCES "shipments"("tenant_id","id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "shipment_items" ADD CONSTRAINT "FK_7118af1cb2ecc4ab9aed2701e01" FOREIGN KEY ("tenant_id", "order_item_id") REFERENCES "order_items"("tenant_id","id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "shipments" ADD CONSTRAINT "FK_f0813a0cd40a906fb6001a3390d" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id","id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "shipments" DROP CONSTRAINT "FK_f0813a0cd40a906fb6001a3390d"`);
        await queryRunner.query(`ALTER TABLE "shipment_items" DROP CONSTRAINT "FK_7118af1cb2ecc4ab9aed2701e01"`);
        await queryRunner.query(`ALTER TABLE "shipment_items" DROP CONSTRAINT "FK_f394be4ca65d54625f497343af9"`);
        await queryRunner.query(`ALTER TABLE "refunds" DROP CONSTRAINT "FK_0d9890dda3fb237b8609780fa73"`);
        await queryRunner.query(`ALTER TABLE "refunds" DROP CONSTRAINT "FK_990295079ce8691c5edeaa13553"`);
        await queryRunner.query(`ALTER TABLE "settlements" DROP CONSTRAINT "FK_e1df982d65628c054a2125246c4"`);
        await queryRunner.query(`ALTER TABLE "settlements" DROP CONSTRAINT "FK_c514bae19e2b3aceb048f7f0134"`);
        await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_eb2d3668c3e7744fd4daebbcd06"`);
        await queryRunner.query(`ALTER TABLE "order_events" DROP CONSTRAINT "FK_178a16ac37812e8f26f40e2f625"`);
        await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT "FK_130af2b40e6c3d2b7fa6a802547"`);
        await queryRunner.query(`ALTER TABLE "product_variant_images" DROP CONSTRAINT "FK_db99b623e16b33583afcad66a40"`);
        await queryRunner.query(`DROP INDEX "public"."orders_tenant_status_created_idx"`);
        await queryRunner.query(`ALTER TABLE "shipments" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "shipment_items" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'pending'`);
        await queryRunner.query(`CREATE INDEX "orders_tenant_status_created_idx" ON "orders" USING btree ("tenant_id", "created_at", "status") `);
        await queryRunner.query(`ALTER TABLE "tenant_settings" ALTER COLUMN "platform_fee_percent" SET DEFAULT 2.50`);
        await queryRunner.query(`ALTER TABLE "product_variant_images" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "description"`);
        await queryRunner.query(`ALTER TABLE "product_variants" DROP COLUMN "name"`);
        await queryRunner.query(`ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_quantity_check" CHECK ((quantity > 0))`);
        await queryRunner.query(`ALTER TABLE "tenant_settings" ADD CONSTRAINT "CK_tenant_settings_capture_mode" CHECK (((capture_mode)::text = ANY ((ARRAY['immediate'::character varying, 'authorize_then_capture'::character varying])::text[])))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "order_events_tenant_provider_event_uidx" ON "order_events" USING btree ("tenant_id", "provider_event_id") WHERE (provider_event_id IS NOT NULL)`);
        await queryRunner.query(`ALTER TABLE "shipments" ADD CONSTRAINT "FK_shipments_tenants" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "shipments" ADD CONSTRAINT "FK_shipments_orders" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id","id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "shipment_items" ADD CONSTRAINT "FK_shipment_items_tenants" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "shipment_items" ADD CONSTRAINT "FK_shipment_items_shipments" FOREIGN KEY ("tenant_id", "shipment_id") REFERENCES "shipments"("tenant_id","id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "shipment_items" ADD CONSTRAINT "FK_shipment_items_order_items" FOREIGN KEY ("tenant_id", "order_item_id") REFERENCES "order_items"("tenant_id","id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "refunds" ADD CONSTRAINT "FK_refunds_payment" FOREIGN KEY ("tenant_id", "payment_id") REFERENCES "payments"("tenant_id","id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "refunds" ADD CONSTRAINT "FK_refunds_order" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id","id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "settlements" ADD CONSTRAINT "FK_settlements_payment" FOREIGN KEY ("tenant_id", "payment_id") REFERENCES "payments"("tenant_id","id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "settlements" ADD CONSTRAINT "FK_settlements_order" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id","id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "FK_payments_order" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id","id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_events" ADD CONSTRAINT "FK_order_events_order" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id","id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "FK_orders_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_items" ADD CONSTRAINT "FK_order_items_order" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "orders"("tenant_id","id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tenant_settings" ADD CONSTRAINT "FK_tenant_settings_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "tenant_settings" ADD CONSTRAINT "FK_tenant_settings_default_currency_code" FOREIGN KEY ("default_currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "product_variant_images" ADD CONSTRAINT "product_variant_images_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "product_variant_images" ADD CONSTRAINT "product_variant_images_variant_fkey" FOREIGN KEY ("tenant_id", "variant_id") REFERENCES "product_variants"("tenant_id","id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

}
