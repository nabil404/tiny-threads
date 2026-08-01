import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentProviderConfigBypassPolicy1785350000002
  implements MigrationInterface
{
  name = 'AddPaymentProviderConfigBypassPolicy1785350000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
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
    await queryRunner.query(
      `DROP POLICY IF EXISTS "tenant_isolation" ON "payment_provider_configs";`,
    );
    await queryRunner.query(`
      CREATE POLICY "tenant_isolation" ON "payment_provider_configs"
        USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
    `);
  }
}
