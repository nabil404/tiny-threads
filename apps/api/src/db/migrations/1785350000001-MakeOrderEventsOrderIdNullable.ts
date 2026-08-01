import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeOrderEventsOrderIdNullable1785350000001 implements MigrationInterface {
  name = 'MakeOrderEventsOrderIdNullable1785350000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order_events" ALTER COLUMN "order_id" DROP NOT NULL;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order_events" ALTER COLUMN "order_id" SET NOT NULL;`,
    );
  }
}
