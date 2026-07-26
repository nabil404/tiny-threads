import { MigrationInterface, QueryRunner } from 'typeorm';
import { enableRls, disableRls } from './helpers/rls.helper';

export class AddMerchantUserAuthTables1785090623376 implements MigrationInterface {
  name = 'AddMerchantUserAuthTables1785090623376';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "merchant_user_identities" ("tenant_id" uuid NOT NULL, "id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "merchant_user_id" uuid NOT NULL, "provider" text NOT NULL, "provider_subject" text, "password_hash" text, "email_verified" boolean NOT NULL DEFAULT false, "verification_token_hash" text, "verification_token_expires_at" TIMESTAMP WITH TIME ZONE, "password_reset_token_hash" text, "password_reset_token_expires_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "merchant_user_identities_tenant_merchant_user_provider_uq" UNIQUE ("tenant_id", "merchant_user_id", "provider"), CONSTRAINT "merchant_user_identities_tenant_provider_subject_uq" UNIQUE ("tenant_id", "provider", "provider_subject"), CONSTRAINT "PK_72070e29fd22869fb07a4ee97e1" PRIMARY KEY ("tenant_id", "id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "merchant_user_identities_tenant_merchant_user_idx" ON "merchant_user_identities"  ("tenant_id", "merchant_user_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "merchant_user_refresh_tokens" ("tenant_id" uuid NOT NULL, "id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "merchant_user_id" uuid NOT NULL, "token_hash" text NOT NULL, "family_id" uuid NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_4c9e5adc56d416b1fb08882bbb0" PRIMARY KEY ("tenant_id", "id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "merchant_user_refresh_tokens_tenant_family_idx" ON "merchant_user_refresh_tokens"  ("tenant_id", "family_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "merchant_user_refresh_tokens_tenant_merchant_user_idx" ON "merchant_user_refresh_tokens"  ("tenant_id", "merchant_user_id") `,
    );

    // RLS must be enabled before the FK constraints below are added: FK
    // validation scans the referencing table, and with FORCE ROW LEVEL
    // SECURITY that scan is itself subject to the tenant_isolation policy.
    await enableRls(queryRunner, 'merchant_user_identities');
    await enableRls(queryRunner, 'merchant_user_refresh_tokens');

    // NOTE: excludes an unrelated `ALTER TABLE "settlements" ADD CONSTRAINT
    // "REL_c514bae19e2b3aceb048f7f013" UNIQUE ("tenant_id", "payment_id")`
    // statement that `pnpm db:generate` also picked up here. This is
    // pre-existing schema drift between InitialMigration.ts's SQL text and
    // the live DB, unrelated to this task (same drift Task 8 encountered
    // and excluded) — not fixed as part of this change.
    await queryRunner.query(
      `ALTER TABLE "merchant_user_identities" ADD CONSTRAINT "FK_0d1049205306bf90743482f6ccf" FOREIGN KEY ("tenant_id", "merchant_user_id") REFERENCES "merchant_users"("tenant_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "merchant_user_refresh_tokens" ADD CONSTRAINT "FK_ce86db17d89f4c1ce5b4d5c60c7" FOREIGN KEY ("tenant_id", "merchant_user_id") REFERENCES "merchant_users"("tenant_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "merchant_user_refresh_tokens" DROP CONSTRAINT "FK_ce86db17d89f4c1ce5b4d5c60c7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "merchant_user_identities" DROP CONSTRAINT "FK_0d1049205306bf90743482f6ccf"`,
    );

    await disableRls(queryRunner, 'merchant_user_refresh_tokens');
    await disableRls(queryRunner, 'merchant_user_identities');

    await queryRunner.query(
      `DROP INDEX "public"."merchant_user_refresh_tokens_tenant_merchant_user_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."merchant_user_refresh_tokens_tenant_family_idx"`,
    );
    await queryRunner.query(`DROP TABLE "merchant_user_refresh_tokens"`);
    await queryRunner.query(
      `DROP INDEX "public"."merchant_user_identities_tenant_merchant_user_idx"`,
    );
    await queryRunner.query(`DROP TABLE "merchant_user_identities"`);
  }
}
