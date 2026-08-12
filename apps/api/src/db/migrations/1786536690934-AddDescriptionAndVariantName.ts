import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDescriptionAndVariantName1786536690934 implements MigrationInterface {
  name = 'AddDescriptionAndVariantName1786536690934';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "product_variants" ADD "name" text`);
    await queryRunner.query(`ALTER TABLE "products" ADD "description" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "description"`);
    await queryRunner.query(
      `ALTER TABLE "product_variants" DROP COLUMN "name"`,
    );
  }
}
