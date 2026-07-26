import { MigrationInterface, QueryRunner } from 'typeorm';
import { enableRls, disableRls } from './helpers/rls.helper';

export class AddCustomerAuthTables1785082378573 implements MigrationInterface {
  name = 'AddCustomerAuthTables1785082378573';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "customer_identities" ("tenant_id" uuid NOT NULL, "id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "customer_id" uuid NOT NULL, "provider" text NOT NULL, "provider_subject" text, "password_hash" text, "email_verified" boolean NOT NULL DEFAULT false, "verification_token_hash" text, "verification_token_expires_at" TIMESTAMP WITH TIME ZONE, "password_reset_token_hash" text, "password_reset_token_expires_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "customer_identities_tenant_customer_provider_uq" UNIQUE ("tenant_id", "customer_id", "provider"), CONSTRAINT "customer_identities_tenant_provider_subject_uq" UNIQUE ("tenant_id", "provider", "provider_subject"), CONSTRAINT "PK_3f9fa79fff931ba91a3f947cb82" PRIMARY KEY ("tenant_id", "id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "customer_identities_tenant_customer_idx" ON "customer_identities"  ("tenant_id", "customer_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "customer_refresh_tokens" ("tenant_id" uuid NOT NULL, "id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "customer_id" uuid NOT NULL, "token_hash" text NOT NULL, "family_id" uuid NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_a7dd7118a97d1c4c343b3baeff6" PRIMARY KEY ("tenant_id", "id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "customer_refresh_tokens_tenant_family_idx" ON "customer_refresh_tokens"  ("tenant_id", "family_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "customer_refresh_tokens_tenant_customer_idx" ON "customer_refresh_tokens"  ("tenant_id", "customer_id") `,
    );

    // RLS must be enabled before the FK constraints below are added: FK
    // validation scans the referencing table, and with FORCE ROW LEVEL
    // SECURITY that scan is itself subject to the tenant_isolation policy.
    await enableRls(queryRunner, 'customer_identities');
    await enableRls(queryRunner, 'customer_refresh_tokens');

    await queryRunner.query(
      `ALTER TABLE "customer_identities" ADD CONSTRAINT "FK_1a0f0a082d4fbbdd87bc70e8b00" FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "customers"("tenant_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_refresh_tokens" ADD CONSTRAINT "FK_88686866597cbbbe573c66c5266" FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "customers"("tenant_id","id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "customer_refresh_tokens" DROP CONSTRAINT "FK_88686866597cbbbe573c66c5266"`,
    );
    await queryRunner.query(
      `ALTER TABLE "customer_identities" DROP CONSTRAINT "FK_1a0f0a082d4fbbdd87bc70e8b00"`,
    );

    await disableRls(queryRunner, 'customer_refresh_tokens');
    await disableRls(queryRunner, 'customer_identities');

    await queryRunner.query(
      `DROP INDEX "public"."customer_refresh_tokens_tenant_customer_idx"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."customer_refresh_tokens_tenant_family_idx"`,
    );
    await queryRunner.query(`DROP TABLE "customer_refresh_tokens"`);
    await queryRunner.query(
      `DROP INDEX "public"."customer_identities_tenant_customer_idx"`,
    );
    await queryRunner.query(`DROP TABLE "customer_identities"`);
  }
}
