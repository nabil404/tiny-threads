import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSoftDeleteToCategories1785360000000 implements MigrationInterface {
  name = 'AddSoftDeleteToCategories1785360000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "categories" ADD "deleted_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "categories_tenant_slug_idx"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "categories_tenant_slug_idx"`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" DROP COLUMN "deleted_at"`,
    );
  }
}
