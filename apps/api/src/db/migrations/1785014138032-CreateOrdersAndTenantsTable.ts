import { MigrationInterface, QueryRunner } from 'typeorm';
import { disableRls, enableRls } from './helpers/rls.helper';

export class CreateOrdersAndTenantsTable1785014138032 implements MigrationInterface {
  name = 'CreateOrdersAndTenantsTable1785014138032';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "tenants" ("id" uuid NOT NULL, "name" text NOT NULL, "slug" text NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_2310ecc5cb8be427097154b18fc" UNIQUE ("slug"), CONSTRAINT "PK_53be67a04681c66b87ee27c9321" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "orders" ("tenant_id" uuid NOT NULL, "id" uuid NOT NULL, "number" text NOT NULL, "status" text NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "orders_tenant_number_uq" UNIQUE ("tenant_id", "number"), CONSTRAINT "PK_c218c0315dc545f5b012e4bf391" PRIMARY KEY ("tenant_id", "id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "orders_tenant_created_idx" ON "orders"  ("tenant_id", "created_at") `,
    );
    await enableRls(queryRunner, 'orders');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await disableRls(queryRunner, 'orders');
    await queryRunner.query(`DROP INDEX "public"."orders_tenant_created_idx"`);
    await queryRunner.query(`DROP TABLE "orders"`);
    await queryRunner.query(`DROP TABLE "tenants"`);
  }
}
