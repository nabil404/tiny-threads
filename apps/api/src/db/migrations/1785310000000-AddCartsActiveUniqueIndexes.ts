import { MigrationInterface, QueryRunner } from 'typeorm';

// Enforces "one active cart per customer, one active cart per guest session"
// at the database level. Without it, two concurrent first-touch requests for
// the same session/customer both see no cart and both insert one, silently
// splitting the items across two active carts; with it the loser gets a
// unique-violation (23505) that CartsService.findOrCreateCart recovers from by
// re-reading the winner's cart.
export class AddCartsActiveUniqueIndexes1785310000000 implements MigrationInterface {
  name = 'AddCartsActiveUniqueIndexes1785310000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // A cart is owned by EITHER a customer OR a guest session, never both.
    // Rows created before that invariant was enforced carry the session id the
    // client kept sending after login, which let anyone holding it reach the
    // customer's cart. Clearing it is both the data half of that security fix
    // and what makes the session index below buildable: a leaked row and the
    // guest's own cart are two active carts sharing one session id.
    //
    // Migrations connect as app_owner and never call withTenant, so with RLS
    // FORCEd this UPDATE would match zero rows (the policy compares against an
    // unset app.current_tenant, which is NULL) while CREATE UNIQUE INDEX still
    // reads every row — the index would then fail on duplicates the UPDATE was
    // silently unable to touch. Dropping FORCE lets the owner through for this
    // one statement; it is restored immediately, inside the same transaction,
    // so a failure anywhere below rolls the table back to FORCEd.
    await queryRunner.query(`ALTER TABLE "carts" NO FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(
      `UPDATE "carts" SET "session_id" = NULL WHERE "customer_id" IS NOT NULL AND "session_id" IS NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "carts" FORCE ROW LEVEL SECURITY`);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "carts_tenant_session_active_uidx" ON "carts" ("tenant_id", "session_id") WHERE "status" = 'active' AND "session_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "carts_tenant_customer_active_uidx" ON "carts" ("tenant_id", "customer_id") WHERE "status" = 'active' AND "customer_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."carts_tenant_customer_active_uidx"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."carts_tenant_session_active_uidx"`,
    );
    // The session_id backfill is intentionally not reversed: restoring the
    // ids would recreate the cross-account access the fix removed.
  }
}
