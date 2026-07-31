import { MigrationInterface, QueryRunner } from 'typeorm';

// 1785300000000-AddCartsAndCustomerAddressesFields added these four columns as
// NOT NULL DEFAULT '' so the ALTER could backfill existing rows, but never
// dropped the default afterwards. Left in place the database silently accepts
// empty strings for logically-required fields, and `db:generate` keeps
// emitting DROP DEFAULT noise for them.
export class DropCustomerAddressesBackfillDefaults1785320000000 implements MigrationInterface {
  name = 'DropCustomerAddressesBackfillDefaults1785320000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "customer_addresses" ALTER COLUMN "first_name" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_addresses" ALTER COLUMN "last_name" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_addresses" ALTER COLUMN "city" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_addresses" ALTER COLUMN "postal_code" DROP DEFAULT`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "customer_addresses" ALTER COLUMN "postal_code" SET DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_addresses" ALTER COLUMN "city" SET DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_addresses" ALTER COLUMN "last_name" SET DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_addresses" ALTER COLUMN "first_name" SET DEFAULT ''`,
    );
  }
}
