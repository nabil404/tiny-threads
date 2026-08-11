import { MigrationInterface, QueryRunner } from 'typeorm';
import { enableRls, disableRls } from './helpers/rls.helper';

export class EnableRlsSupport1785070807146 implements MigrationInterface {
  name = 'EnableRlsSupport1785070807146';

  private tenantTables = [
    'merchant_users',
    'product_variants',
    'categories',
    'product_categories',
    'products',
    'customers',
    'customer_addresses',
    'cart_items',
    'carts',
    'payment_provider_configs',
    'customer_identities',
    'customer_refresh_tokens',
    'merchant_user_identities',
    'merchant_user_refresh_tokens',
    'merchant_user_invites',
    'tenant_settings',
    'orders',
    'order_items',
    'order_events',
    'payments',
    'settlements',
    'refunds',
    'shipments',
    'shipment_items',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Enable & force standard RLS policies on all 24 tenant-scoped tables
    for (const table of this.tenantTables) {
      await enableRls(queryRunner, table);
    }

    // 2. Configure bypass policy for payment_provider_configs (allowing app.bypass_rls flag)
    await queryRunner.query(
      `DROP POLICY IF EXISTS "tenant_isolation" ON "payment_provider_configs";`,
    );
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation" ON "payment_provider_configs"
        USING (
          current_setting('app.bypass_rls', true) = 'true'
          OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
        )
        WITH CHECK (
          current_setting('app.bypass_rls', true) = 'true'
          OR tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
        );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Disable RLS on all 24 tenant tables in reverse order
    for (const table of [...this.tenantTables].reverse()) {
      await disableRls(queryRunner, table);
    }
  }
}
