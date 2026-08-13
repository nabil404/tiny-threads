import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConvertProductDescriptionToJsonb1786620946757 implements MigrationInterface {
  name = 'ConvertProductDescriptionToJsonb1786620946757';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "description"`);
    await queryRunner.query(`ALTER TABLE "products" ADD "description" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "description"`);
    await queryRunner.query(`ALTER TABLE "products" ADD "description" text`);
  }
}
