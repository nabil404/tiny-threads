import { MigrationInterface, QueryRunner } from 'typeorm';

// Adds the missing index on the hottest lookup key of both refresh-token
// tables. refresh() and logout() find rows exclusively by { tenantId,
// tokenHash }, and these tables grow unbounded (one row per login, plus one
// per rotation), so without an index every token rotation was a sequential
// scan. UNIQUE rather than a plain index so two live tokens can never share a
// hash and make that lookup ambiguous.
//
// No enableRls/disableRls calls here: both tables already have RLS
// ENABLEd + FORCEd with a tenant_isolation policy from
// AddCustomerAuthTables/AddMerchantUserAuthTables. Adding a constraint to an
// existing table neither drops nor re-creates that state.
export class AddRefreshTokenHashIndexes1785182808777 implements MigrationInterface {
  name = 'AddRefreshTokenHashIndexes1785182808777';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // NOTE: excludes an unrelated `ALTER TABLE "settlements" ADD CONSTRAINT
    // "REL_c514bae19e2b3aceb048f7f013" UNIQUE ("tenant_id", "payment_id")`
    // statement that `pnpm db:generate` also picked up here. This is
    // pre-existing schema drift between InitialMigration.ts's SQL text and the
    // live DB, unrelated to this change (same drift Tasks 8, 12 and 13
    // encountered and excluded) — not fixed as part of this change.
    await queryRunner.query(
      `ALTER TABLE "merchant_user_refresh_tokens" ADD CONSTRAINT "merchant_user_refresh_tokens_tenant_token_hash_uq" UNIQUE ("tenant_id", "token_hash")`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_refresh_tokens" ADD CONSTRAINT "customer_refresh_tokens_tenant_token_hash_uq" UNIQUE ("tenant_id", "token_hash")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "customer_refresh_tokens" DROP CONSTRAINT "customer_refresh_tokens_tenant_token_hash_uq"`,
    );
    await queryRunner.query(
      `ALTER TABLE "merchant_user_refresh_tokens" DROP CONSTRAINT "merchant_user_refresh_tokens_tenant_token_hash_uq"`,
    );
  }
}
