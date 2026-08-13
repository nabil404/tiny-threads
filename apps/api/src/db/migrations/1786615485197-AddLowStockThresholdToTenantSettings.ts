import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLowStockThresholdToTenantSettings1786615485197 implements MigrationInterface {
  name = 'AddLowStockThresholdToTenantSettings1786615485197';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenant_settings" ADD "low_stock_threshold" int NOT NULL DEFAULT 10`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenant_settings" DROP COLUMN "low_stock_threshold"`,
    );
  }
}
