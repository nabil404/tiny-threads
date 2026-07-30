import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCartsAndCustomerAddressesFields1780000000000 implements MigrationInterface {
  name = 'AddCartsAndCustomerAddressesFields1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "carts" ALTER COLUMN "customer_id" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "carts" ADD COLUMN IF NOT EXISTS "session_id" text`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "carts_tenant_session_idx" ON "carts" ("tenant_id", "session_id")`);

    await queryRunner.query(`ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "first_name" text NOT NULL DEFAULT ''`);
    await queryRunner.query(`ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "last_name" text NOT NULL DEFAULT ''`);
    await queryRunner.query(`ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "company" text`);
    await queryRunner.query(`ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "line2" text`);
    await queryRunner.query(`ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "city" text NOT NULL DEFAULT ''`);
    await queryRunner.query(`ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "state_province" text`);
    await queryRunner.query(`ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "postal_code" text NOT NULL DEFAULT ''`);
    await queryRunner.query(`ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "phone" text`);
    await queryRunner.query(`ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "is_default_shipping" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "is_default_billing" boolean NOT NULL DEFAULT false`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "carts_tenant_session_idx"`);
    await queryRunner.query(`ALTER TABLE "carts" DROP COLUMN "session_id"`);
    await queryRunner.query(`ALTER TABLE "carts" ALTER COLUMN "customer_id" SET NOT NULL`);

    await queryRunner.query(`ALTER TABLE "customer_addresses" DROP COLUMN "is_default_billing"`);
    await queryRunner.query(`ALTER TABLE "customer_addresses" DROP COLUMN "is_default_shipping"`);
    await queryRunner.query(`ALTER TABLE "customer_addresses" DROP COLUMN "phone"`);
    await queryRunner.query(`ALTER TABLE "customer_addresses" DROP COLUMN "postal_code"`);
    await queryRunner.query(`ALTER TABLE "customer_addresses" DROP COLUMN "state_province"`);
    await queryRunner.query(`ALTER TABLE "customer_addresses" DROP COLUMN "city"`);
    await queryRunner.query(`ALTER TABLE "customer_addresses" DROP COLUMN "line2"`);
    await queryRunner.query(`ALTER TABLE "customer_addresses" DROP COLUMN "company"`);
    await queryRunner.query(`ALTER TABLE "customer_addresses" DROP COLUMN "last_name"`);
    await queryRunner.query(`ALTER TABLE "customer_addresses" DROP COLUMN "first_name"`);
  }
}
