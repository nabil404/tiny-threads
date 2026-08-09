import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLocaleToMerchantUsers1786276191388 implements MigrationInterface {
  name = 'AddLocaleToMerchantUsers1786276191388';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "merchant_users" ADD "locale" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "merchant_users" DROP COLUMN "locale"`,
    );
  }
}
