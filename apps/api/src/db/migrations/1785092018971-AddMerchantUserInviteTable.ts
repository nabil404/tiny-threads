import { MigrationInterface, QueryRunner } from 'typeorm';
import { enableRls, disableRls } from './helpers/rls.helper';

export class AddMerchantUserInviteTable1785092018971
  implements MigrationInterface
{
  name = 'AddMerchantUserInviteTable1785092018971';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "merchant_user_invites" ("tenant_id" uuid NOT NULL, "id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "email" text NOT NULL, "role" text NOT NULL, "token_hash" text NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE, "invited_by_merchant_user_id" uuid, CONSTRAINT "merchant_user_invites_tenant_token_hash_uq" UNIQUE ("tenant_id", "token_hash"), CONSTRAINT "PK_16e728cb2efbef132b6e004c9da" PRIMARY KEY ("tenant_id", "id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "merchant_user_invites_tenant_email_idx" ON "merchant_user_invites"  ("tenant_id", "email") `,
    );

    // RLS must be enabled before the FK constraint below is added: FK
    // validation scans the referencing table, and with FORCE ROW LEVEL
    // SECURITY that scan is itself subject to the tenant_isolation policy.
    await enableRls(queryRunner, 'merchant_user_invites');

    // NOTE: excludes an unrelated `ALTER TABLE "settlements" ADD CONSTRAINT
    // "REL_c514bae19e2b3aceb048f7f013" UNIQUE ("tenant_id", "payment_id")`
    // statement that `pnpm db:generate` also picked up here. This is
    // pre-existing schema drift between InitialMigration.ts's SQL text and
    // the live DB, unrelated to this task (same drift Tasks 8 and 12
    // encountered and excluded) — not fixed as part of this change.
    await queryRunner.query(
      `ALTER TABLE "merchant_user_invites" ADD CONSTRAINT "FK_011dcb4f39eb8cdc951430f946f" FOREIGN KEY ("tenant_id", "invited_by_merchant_user_id") REFERENCES "merchant_users"("tenant_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "merchant_user_invites" DROP CONSTRAINT "FK_011dcb4f39eb8cdc951430f946f"`,
    );

    await disableRls(queryRunner, 'merchant_user_invites');

    await queryRunner.query(
      `DROP INDEX "public"."merchant_user_invites_tenant_email_idx"`,
    );
    await queryRunner.query(`DROP TABLE "merchant_user_invites"`);
  }
}
