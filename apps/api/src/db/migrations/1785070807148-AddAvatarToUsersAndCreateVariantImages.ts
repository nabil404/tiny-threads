import { MigrationInterface, QueryRunner } from 'typeorm';
import { enableRls, disableRls } from './helpers/rls.helper';

export class AddAvatarToUsersAndCreateVariantImages1785070807148 implements MigrationInterface {
  name = 'AddAvatarToUsersAndCreateVariantImages1785070807148';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE merchant_users
        ADD COLUMN avatar_url text NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE customers
        ADD COLUMN avatar_url text NULL;
    `);

    await queryRunner.query(`
      CREATE TABLE product_variant_images (
        tenant_id uuid NOT NULL,
        id uuid NOT NULL DEFAULT uuid_generate_v7(),
        variant_id uuid NOT NULL,
        storage_key text NOT NULL,
        url text NOT NULL,
        alt_text text NULL,
        sort_order int NOT NULL DEFAULT 0,
        is_primary boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT product_variant_images_pkey PRIMARY KEY (tenant_id, id),
        CONSTRAINT product_variant_images_tenant_fkey FOREIGN KEY (tenant_id)
          REFERENCES tenants(id) ON DELETE CASCADE,
        CONSTRAINT product_variant_images_variant_fkey FOREIGN KEY (tenant_id, variant_id)
          REFERENCES product_variants(tenant_id, id) ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`
      CREATE INDEX product_variant_images_tenant_variant_idx
        ON product_variant_images (tenant_id, variant_id, sort_order ASC);
    `);

    await enableRls(queryRunner, 'product_variant_images');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await disableRls(queryRunner, 'product_variant_images');
    await queryRunner.query(`DROP TABLE IF EXISTS product_variant_images;`);
    await queryRunner.query(
      `ALTER TABLE customers DROP COLUMN IF EXISTS avatar_url;`,
    );
    await queryRunner.query(
      `ALTER TABLE merchant_users DROP COLUMN IF EXISTS avatar_url;`,
    );
  }
}
