import { MigrationInterface, QueryRunner } from 'typeorm';

// Replaces subdomain-slug resolution (tenants.slug + PLATFORM_HOST_SUFFIX)
// with an exact-match tenants.host column — see
// docs/superpowers/specs/2026-07-29-tenant-host-resolution-design.md.
//
// The backfill (host = slug || '.localhost') exists only so this migration
// doesn't fail against dev/test databases that already have tenant rows
// with no real host value to derive from. There is no production tenant
// data to migrate for real; this is a safety net, not a migration
// strategy. The up() transform is injective (slug was already unique), so
// it can never collide with the new UNIQUE constraint on host. down()'s
// reverse transform is lossy/non-injective for real custom-domain hosts
// (e.g. "shop.a.com" and "shop.b.com" both yield "shop") — it only
// round-trips cleanly for the "<slug>.localhost"-shaped hosts this
// migration's own backfill produces.

export class AddTenantHostColumn1785279546172 implements MigrationInterface {
  name = 'AddTenantHostColumn1785279546172';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "tenants" ADD COLUMN "host" text`);
    await queryRunner.query(
      `UPDATE "tenants" SET "host" = "slug" || '.localhost' WHERE "host" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenants" ALTER COLUMN "host" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenants" DROP CONSTRAINT "UQ_2310ecc5cb8be427097154b18fc"`,
    );
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "slug"`);
    await queryRunner.query(
      `ALTER TABLE "tenants" ADD CONSTRAINT "tenants_host_uq" UNIQUE ("host")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tenants" DROP CONSTRAINT "tenants_host_uq"`,
    );
    await queryRunner.query(`ALTER TABLE "tenants" ADD COLUMN "slug" text`);
    await queryRunner.query(
      `UPDATE "tenants" SET "slug" = split_part("host", '.', 1)`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenants" ALTER COLUMN "slug" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenants" ADD CONSTRAINT "UQ_2310ecc5cb8be427097154b18fc" UNIQUE ("slug")`,
    );
    await queryRunner.query(`ALTER TABLE "tenants" DROP COLUMN "host"`);
  }
}
