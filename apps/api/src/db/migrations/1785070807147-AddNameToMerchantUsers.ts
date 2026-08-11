import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNameToMerchantUsers1785070807147
  implements MigrationInterface
{
  name = 'AddNameToMerchantUsers1785070807147';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "merchant_users" ADD "first_name" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "merchant_users" ADD "last_name" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "merchant_users" DROP COLUMN "last_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "merchant_users" DROP COLUMN "first_name"`,
    );
  }
}
