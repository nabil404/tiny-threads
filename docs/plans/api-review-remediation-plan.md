# `apps/api` Review — Cause & Fix Plan

Status: proposed (2026-08-01)
Scope: findings from reviewing the commerce modules added in `801a724`
(payments), `27c0a38` (checkout), and `4c29778` (orders), plus the pre-existing
carts / tenant-settings code they build on.

Baseline at time of review: `pnpm build` passes; 46 unit suites / 389 tests
pass; `eslint` reports 20 errors; overall statement coverage 67.93%.

Companion doc: [`api-test-coverage-plan.md`](./api-test-coverage-plan.md) —
the testing work that keeps these fixes from regressing. Finding IDs (`R1`…)
are shared between the two documents.

---

## How to read this

Each finding has:

- **Symptom** — what an operator or user actually observes.
- **Root cause** — the design or process gap that produced it, not just the
  faulty line.
- **Evidence** — the reproduction or the specific code that proves it.
- **Blast radius** — who is affected and how badly.
- **Fix** — concrete change, with code where the shape matters.
- **Verification** — how we prove it's fixed.

## Remediation batches

Batches are ordered so each one leaves `main` in a better state than it found
it. Batch 1 must land before any other work touches migrations.

| Batch | Findings | Theme | Rough size |
| --- | --- | --- | --- |
| **1** | R1, R2 | Restore the ability to build the schema | ~1h + DB reconciliation |
| **2** | R3, R4, R5, R6, R7, R8, R10 | Correctness & security | ~1–2 days |
| **3** | R9, R18, R19, R20, R21 | Convention & hygiene | ~half a day |
| **4** | R14, R15, R16, R17 | Schema quality & API shape | ~1 day |
| **5** | R11, R12, R13 | Architectural drift back to the skill spec | multi-day, own design pass |

Batch 5 is deliberately separated: it is a redesign, not a patch, and it should
not be rushed behind the security work in Batch 2.

---

# Batch 1 — Schema provisioning is broken

## R1 — A fresh database cannot be migrated 🔴

**Symptom.** `pnpm db:migrate` against an empty database fails on the very
first migration. New developer setup, CI from scratch, and any new environment
are all blocked. Existing dev/test databases are unaffected and give no signal.

**Root cause.** TypeORM executes migrations in ascending order of the numeric
timestamp prefix, not file creation order or dependency order.
`1722510000000-CreateOrderAndCheckoutTables.ts` carries a timestamp of
**2024-08-01**, while every other migration in the repo is timestamped
**2026-07/08** (`1785070807145`…`1785320000000`). The orders migration
therefore sorts *first* — before `InitialMigration` has created `tenants` —
and its `FOREIGN KEY … REFERENCES "tenants"("id")` has nothing to point at.

The timestamp appears to have been hand-written rather than produced by
`pnpm db:generate` (which wraps the TypeORM CLI and stamps `Date.now()`). The
process gap is that **nothing in the repo ever migrates from zero**: the
`pretest` / `pretest:e2e` hooks run `db:migrate:test` against a long-lived
container that already holds the earlier migrations, so the ordering defect is
structurally invisible to every existing check.

**Evidence.** Against a throwaway database:

```
$ createdb tt_order_check … && typeorm migration:run
0 migrations are already loaded in the database.
10 migrations are new migrations must be executed.
query: DROP TABLE IF EXISTS "refunds", "settlements", … CASCADE;
query: CREATE TABLE "tenant_settings" ( … );
error: relation "tenants" does not exist
Migration "CreateOrderAndCheckoutTables1722510000000" failed
```

Afterwards the database contains exactly one table: `migrations`.

Both existing databases confirm the migration ran *last* in practice, because
it was added last:

```
 id |                        name
----+----------------------------------------------------
 11 | DropCustomerAddressesBackfillDefaults1785320000000
 12 | CreateOrderAndCheckoutTables1722510000000
```

**Blast radius.** Total for new environments; zero for existing ones. This is
the reason it shipped unnoticed.

**Fix.** Renumber the migration to sort after the migration it actually depends
on, then reconcile the recorded name in the databases that already ran it —
**without letting it re-run**, because re-running triggers R2's destructive
preamble.

1. Rename the file and class:

   ```
   src/db/migrations/1722510000000-CreateOrderAndCheckoutTables.ts
   → src/db/migrations/1785330000000-CreateOrderAndCheckoutTables.ts
   ```

   ```ts
   export class CreateOrderAndCheckoutTables1785330000000
     implements MigrationInterface
   {
     name = 'CreateOrderAndCheckoutTables1785330000000';
   ```

   `1785330000000` is the next free slot above `1785320000000`. Keep the class
   name suffix and the `name` property identical to the filename prefix —
   TypeORM matches the `migrations` row on the `name` property.

2. Reconcile each existing database (dev **and** test) so TypeORM considers the
   renamed migration already applied:

   ```sql
   UPDATE migrations
      SET name = 'CreateOrderAndCheckoutTables1785330000000'
    WHERE name = 'CreateOrderAndCheckoutTables1722510000000';
   ```

   Run as `app_owner`. Verify with `typeorm migration:show` that nothing is
   pending afterwards.

   For throwaway local databases, recreating the volume is simpler and safer
   than the `UPDATE`.

**Verification.**

- `pnpm --filter @tiny-threads/api db:verify-fresh` (new script, below) exits 0.
- `typeorm migration:show` reports no pending migrations against dev and test.

**Prevention — this is the important half.** Add a scratch-database migration
check and run it in CI on every PR touching `src/db/`:

`apps/api/scripts/db-verify-fresh.sh`

```sh
#!/bin/sh
# Proves the schema can be built from nothing. The pretest hooks only ever
# migrate a database that already holds earlier migrations, which is why an
# out-of-order timestamp (R1) was invisible to every other check.
set -eu

DB="tt_fresh_$$"
BASE="${DATABASE_URL_MIGRATIONS%/*}"

cleanup() { psql "$BASE/postgres" -c "DROP DATABASE IF EXISTS \"$DB\"" >/dev/null 2>&1 || true; }
trap cleanup EXIT

psql "$BASE/postgres" -c "CREATE DATABASE \"$DB\" OWNER app_owner"
DATABASE_URL_MIGRATIONS="$BASE/$DB" \
  typeorm-ts-node-commonjs migration:run -d ./src/db/data-source.ts
DATABASE_URL="$BASE/$DB" pnpm db:verify-rls
echo "fresh-database migration + RLS verification OK"
```

Plus a pure unit test (`src/db/__tests__/migration-order.spec.ts`) that needs no
database and fails in milliseconds:

- every migration filename's numeric prefix is strictly increasing in sorted
  order and matches its exported class-name suffix and `name` property;
- no two migrations share a timestamp.

---

## R2 — Migration `up()` unconditionally drops seven tables 🔴

**Symptom.** None yet. It becomes catastrophic the moment the migration is
re-run — which R1's fix would have caused had we not reconciled the recorded
name instead.

**Root cause.** The migration opens with a defensive cleanup of "old initial
placeholder tables":

`src/db/migrations/1722510000000-CreateOrderAndCheckoutTables.ts:9-11`

```ts
await queryRunner.query(
  `DROP TABLE IF EXISTS "refunds", "settlements", "payments", "order_events", "order_items", "orders", "tenant_settings" CASCADE;`,
);
```

This was presumably written to make the migration re-runnable during local
iteration. That's a development convenience encoded permanently into a
production migration. A migration's `up()` must be safe to apply exactly once
to a database in the state its predecessors left it in — anything it drops, it
must have created itself in the same `up()`.

`CASCADE` widens the damage: it silently drops dependent objects beyond the
seven named tables.

**Blast radius.** Irreversible loss of all order, payment, settlement, and
refund history — the exact records needed for dispute defence and
reconciliation, per the skill's Orders guidance.

**Fix.** Delete the three lines. If the placeholder tables genuinely exist in
some environment, retiring them belongs in its own explicitly-named migration
that a human chooses to run.

```diff
-    // Safely drop old initial placeholder tables if they exist
-    await queryRunner.query(
-      `DROP TABLE IF EXISTS "refunds", "settlements", … CASCADE;`,
-    );
-
     await queryRunner.query(`
       CREATE TABLE "tenant_settings" ( …
```

**Verification.** The `migration-order.spec.ts` guard from R1 gains a rule:
a migration may not `DROP TABLE` a table it does not `CREATE TABLE` in the same
`up()`. Grep-level, but sufficient — it catches the copy-paste that produced
this.

---

# Batch 2 — Correctness and security

## R3 — Nested transaction in checkout deadlocks the connection pool 🔴

**Symptom.** Under concurrent checkout load, requests hang rather than failing.
The pool never recovers until the transactions time out.

**Root cause.** `CheckoutService.checkout` reads tenant settings *twice*, and
the second read happens **inside** the outer transaction:

`src/checkout/checkout.service.ts:34` (outside — for the guest-checkout gate)
`src/checkout/checkout.service.ts:160-161` (inside `tenantDb.run`):

```ts
const settings =
  await this.tenantSettingsService.getSettings(effectiveTenantId);
```

`TenantSettingsService.getSettings` calls `this.tenantDb.run(...)` →
`withTenant(...)` → `dataSource.transaction(...)`. TypeORM's
`DataSource.transaction` always allocates a fresh QueryRunner
(`DataSource.js:344 — const usedQueryRunner = queryRunner ?? this.createQueryRunner()`),
which checks out a **second connection from the pool**.

By that point the outer transaction is holding `SELECT … FOR UPDATE` locks on
every `product_variants` row in the cart (`checkout.service.ts:72-75`).
`DatabaseModule` sets no `extra.max`, so `pg` defaults to a pool of 10. Ten
concurrent checkouts hold all ten connections and each blocks waiting for an
eleventh that can never be freed.

The deeper cause is a missing convention: `PaymentsService` already models the
right pattern — an optional `manager?: EntityManager` parameter, used when the
caller is already inside a transaction (`payments.service.ts:82-84`).
`TenantSettingsService` has no such affordance, so a caller inside a
transaction has no correct way to use it.

Secondary defect: the nested transaction **commits independently**. First-time
`getSettings` inserts a defaults row; if the surrounding checkout then rolls
back, that row persists.

**Blast radius.** Storefront checkout becomes unavailable under modest
concurrency. Not a data-integrity issue, but a full availability outage of the
revenue path.

**Fix.** Read settings exactly once, before the transaction opens, and pass the
value down. This removes both the nesting and the duplicate query.

```diff
 async checkout(dto: CheckoutDto, customerId?: string) {
-  if (!customerId) {
-    const settings = await this.tenantSettingsService.getSettings();
-    if (!settings.allowGuestCheckout) { … }
-  }
+  // Read once, outside the transaction. Calling getSettings() from inside
+  // tenantDb.run would open a second transaction — and therefore check out a
+  // second pooled connection — while this request already holds FOR UPDATE
+  // locks on the cart's variants. Under concurrency that deadlocks the pool.
+  const settings = await this.tenantSettingsService.getSettings();
+
+  if (!customerId && !settings.allowGuestCheckout) {
+    throw new CodedForbiddenException(
+      ErrorCode.GUEST_CHECKOUT_DISABLED,
+      'Guest checkout is disabled for this store',
+    );
+  }

   return this.tenantDb.run(async (manager) => {
     …
-    const settings =
-      await this.tenantSettingsService.getSettings(effectiveTenantId);
     const paymentResult = await this.paymentsService.processOrderPayment(
       savedOrder, paymentToken, settings.platformFeePercent, manager,
     );
```

The `tenantId?` parameter on `getSettings` then has no remaining caller and
should be deleted — it was only ever used to supply a tenant id for the
create path, which CLS already provides.

**As a general guard,** give `TenantSettingsService` the same optional-manager
shape `PaymentsService` uses, so a future in-transaction caller has a correct
option rather than an incorrect one:

```ts
async getSettings(manager?: EntityManager): Promise<TenantSettings> {
  const work = async (em: EntityManager) => { … };
  return manager ? work(manager) : this.tenantDb.run(work);
}
```

**Verification.**

- Unit: assert `tenantDb.run` is invoked exactly once per `checkout()` call.
  `carts.service.spec.ts` already has this harness
  (`'should open exactly one tenantDb.run per public method call, never nested'`)
  — reuse it verbatim.
- E2E: fire `pool_max + 5` concurrent checkouts; all must complete.

**Follow-up worth doing regardless.** Set an explicit pool size and acquisition
timeout in `DatabaseModule` so pool exhaustion surfaces as a fast, loud error
instead of a hang:

```ts
extra: { max: 20, connectionTimeoutMillis: 5_000 },
```

---

## R4 — Checkout accepts any cart id in the tenant (IDOR) 🔴

**Symptom.** A customer can check out another customer's cart. The resulting
order is created under the *attacker's* account but contains the *victim's*
items, and the response body discloses them.

**Root cause.** `CheckoutService` resolves the cart from a client-supplied id
with no ownership predicate:

`src/checkout/checkout.service.ts:46-49`

```ts
const cart = await manager.findOne(Cart, {
  where: { id: dto.cartId },
  relations: { items: true },
});
```

RLS scopes this to the tenant, and the tenant boundary holds — but **RLS is not
an authorization mechanism within a tenant**, and nothing here checks the
caller.

The striking part is that `CartsService` gets this exactly right and documents
why. `activeCartWhere` (`carts.service.ts:34-41`) carries a comment explaining
that a cart is owned by *either* a customer *or* a guest session, and that
omitting `customerId: IsNull()` from session lookups would let any anonymous
request holding a session id reach a customer's cart. `getActiveCart` exists
specifically so mutating routes cannot conjure a cart. `CartsController` never
accepts a cart id from the client at all — it derives the cart from
`req.user.sub` or the `x-guest-session-id` header.

Checkout, written later and in a different module, reintroduced the client-
supplied identifier that the carts module had deliberately designed out. The
root cause is that the ownership rule lived in a private helper in one module
rather than in a shared, reusable predicate.

**Blast radius.** Within a tenant, any actor who obtains a cart UUID can:

- read the victim's cart contents via the returned order items;
- consume inventory the victim intended to buy;
- flip the victim's cart to `converted`, silently emptying it (denial of
  service on their session);
- with guest checkout enabled, do all of the above **unauthenticated**.

Cart ids are UUIDv7 and not enumerable, so this needs a leaked id (logs,
referrer, shared device, a client bug). That lowers likelihood, not severity.

**Fix — recommended.** Stop accepting `cartId` entirely. The partial unique
indexes added in `1785310000000-AddCartsActiveUniqueIndexes` guarantee **at
most one active cart per customer and per guest session**, so the cart is fully
determined by the caller's identity. A parameter that can only ever be right or
malicious should not exist.

1. `CheckoutController` reads the guest session header, mirroring
   `CartsController` (including its UUID validation):

   ```ts
   @Post()
   @UseGuards(OptionalCustomerJwtAuthGuard)
   async checkout(
     @Req() req: Request,
     @Headers('x-guest-session-id') guestSessionId: string | undefined,
     @Body() dto: CheckoutDto,
   ) {
     const customerId = (req.user as CustomerAccessTokenPayload | undefined)?.sub;
     return this.checkoutService.checkout(
       dto,
       customerId,
       this.resolveGuestSessionId(guestSessionId),
     );
   }
   ```

2. Export the ownership predicate from the carts module so there is **one**
   definition of cart ownership in the codebase:

   ```ts
   // carts.service.ts
   export function activeCartWhere(
     customerId?: string,
     sessionId?: string,
   ): FindOptionsWhere<Cart> { … }   // unchanged body, now exported
   ```

3. `CheckoutService` uses it:

   ```ts
   const cart = await manager.findOne(Cart, {
     where: activeCartWhere(customerId, sessionId),
     relations: { items: true },
   });

   if (!cart || !cart.items?.length) {
     throw new CodedBadRequestException(ErrorCode.CART_EMPTY, 'Cart is empty');
   }
   ```

   Note `activeCartWhere` already pins `status: 'active'`, which subsumes the
   existing `cart.status === 'converted'` check — that condition can go.

4. Remove `cartId` from `CheckoutDto`. This is a breaking API change; `apps/web`
   has no storefront UI yet, so the cost is zero today and rises with every week
   it waits.

**Fix — minimal alternative,** if keeping `cartId` is required for an external
consumer: merge the id into the ownership predicate rather than replacing it.

```ts
where: { ...activeCartWhere(customerId, sessionId), id: dto.cartId },
```

This is safe, but leaves a redundant client-controlled parameter whose only
function is to be validated away.

**Verification.** See coverage plan §2.1 — unit cases for customer-uses-other-
customer's-cart, guest-uses-customer-cart, guest-uses-other-guest's-cart, plus
an e2e with two real customers asserting the victim's items never appear in the
attacker's response.

---

## R5 — Merchants can set their own platform fee 🟠

**Symptom.** A merchant admin can zero out — or invert — the platform's revenue
share on every subsequent order.

**Root cause.** Two independent mistakes compound:

1. **Unbounded validation.** `UpdateTenantSettingsDto.platformFeePercent` is
   `@IsOptional() @IsNumber()` with no `@Min`/`@Max`
   (`src/tenant-settings/dto/update-tenant-settings.dto.ts`).
2. **Wrong authority.** `PATCH /merchant-admins/settings` is guarded
   `@Roles('owner', 'admin')` — the merchant's own staff — yet
   `platform_fee_percent` is a **platform-side commercial term**, not a store
   preference. It sits in the same DTO as `allowGuestCheckout`, which genuinely
   is a merchant setting, and inherited its authorization by proximity.

The settlement math then trusts the value unconditionally
(`payments.service.ts:57-60`):

```ts
const platformFeeCents = Math.round(order.totalCents * (platformFeePercent / 100));
const merchantNetAmountCents = order.totalCents - platformFeeCents;
```

With `platformFeePercent: 0` the platform earns nothing. With `-10`,
`platformFeeCents` is negative and `merchantNetAmountCents` **exceeds gross** —
the settlement claims the platform owes the merchant more than the customer
paid. With `150`, merchant net goes negative.

**Blast radius.** Direct, silent, unbounded revenue loss, self-served by every
merchant admin, with no audit trail distinguishing it from a legitimate change.

**Fix.**

1. Remove `platformFeePercent` from the merchant-facing DTO and controller. The
   column stays; only the write surface goes.

   ```diff
    export class UpdateTenantSettingsDto {
      @IsOptional()
      @IsBoolean({ message: field(ErrorCode.IS_BOOLEAN) })
      allowGuestCheckout?: boolean;
   -
   -  @IsOptional()
   -  @IsNumber()
   -  platformFeePercent?: number;
    }
   ```

   Consider omitting it from the `GET` response too, or keeping it read-only —
   visibility is fine, writability is not.

2. Add bounds at the boundary that will eventually own it (a platform-admin
   surface; `platform_admins` already exists as a table). Until that surface is
   built, the value is set by migration/seed only:

   ```ts
   @Min(0, { message: field(ErrorCode.MIN) })
   @Max(100, { message: field(ErrorCode.MAX) })
   platformFeePercent!: number;
   ```

3. Defend in the settlement path regardless of who wrote the value — this is
   money arithmetic and should not trust its input:

   ```ts
   const pct = Number(platformFeePercent);
   if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
     throw new CodedBadRequestException(
       ErrorCode.INTERNAL_SERVER_ERROR,
       'Platform fee percentage is out of range',
     );
   }
   ```

4. Add a DB `CHECK` as the final backstop, in the same migration as R14/R15:

   ```sql
   ALTER TABLE "tenant_settings"
     ADD CONSTRAINT "CK_tenant_settings_platform_fee_percent"
     CHECK ("platform_fee_percent" >= 0 AND "platform_fee_percent" <= 100);
   ```

**Verification.** Coverage plan §2.3, plus a property-style assertion that
`platformFeeCents >= 0` and `merchantNetAmountCents <= grossAmountCents` for
every accepted settings value.

---

## R6 — Negative and fractional refunds are accepted 🟠

**Symptom.** A merchant admin can post a refund of `-5000`, which writes a
negative `Refund` row and can walk an order's payment status *backwards*.

**Root cause.** The validation is one-sided at every layer.

- `RefundOrderDto.amountCents` is `@IsNumber()` only — no `@IsInt()`, no
  `@Min(1)`. `IS_INT`, `MIN`, and `MAX` all already exist in the `ErrorCode`
  enum, so this is an omission, not a missing capability.
- `PaymentsService.refundPayment` checks only the ceiling
  (`payments.service.ts:114`):

  ```ts
  if (existingSum + amountCents > payment.amountCents) { throw … }
  ```

  A negative `amountCents` trivially satisfies this.

- `OrdersService.refundOrder` then sums all refunds and derives the payment
  status (`orders.service.ts:180-189`). A negative row drags `totalRefunded`
  down, so an order already at `refunded` can be pushed back to
  `partially_refunded`.

The underlying pattern: "amount" was validated as a *bound* (don't exceed the
capture) rather than as a *domain value* (a positive integer count of minor
units). The skill specifies `Money` as integer minor units precisely to make
this a type-level concern; there is no `Money` type here yet (see R13).

**Blast radius.** State corruption in the payment ledger, and — once a real
provider replaces the mock — a negative-amount call passed straight to a
payment API. Requires merchant-admin credentials, so this is insider/compromised-
account risk rather than anonymous.

**Fix.**

DTO:

```ts
@IsInt({ message: field(ErrorCode.IS_INT) })
@Min(1, { message: field(ErrorCode.MIN) })
amountCents!: number;
```

Service — defend independently of the DTO, since `refundPayment` is a public
method reachable from other call sites:

```ts
if (!Number.isInteger(amountCents) || amountCents <= 0) {
  throw new CodedBadRequestException(
    ErrorCode.VALIDATION_FAILED,
    'Refund amount must be a positive integer number of minor units',
  );
}
```

Database backstop, same migration as R14:

```sql
ALTER TABLE "refunds"
  ADD CONSTRAINT "CK_refunds_amount_positive" CHECK ("amount_cents" > 0);
```

**Verification.** Coverage plan §2.2, including the cumulative-refund case
across multiple calls — currently only a single call is tested.

---

## R7 — Cancelling a paid order refunds nothing 🟠

**Symptom.** A merchant cancels an order the customer has already paid for. The
stock returns, the order reads `cancelled`, and the customer's money stays
captured with the settlement intact.

**Root cause.** The transition table permits money-bearing transitions
(`orders.service.ts:17-22`):

```ts
const VALID_TRANSITIONS: Record<string, string[]> = {
  pending_payment: ['paid', 'cancelled'],
  paid:            ['processing', 'cancelled'],   // ← captured funds
  processing:      ['shipped', 'cancelled'],      // ← captured funds
  shipped:         ['delivered'],
};
```

but the handler treats *every* cancellation as inventory-only
(`orders.service.ts:59-61`):

```ts
if (newStatus === 'cancelled') {
  await this.restoreStockForOrder(manager, order);
}
```

The side-effect table in the backend-engineer skill is explicit that
"cancel before fulfillment" must *both* release inventory *and* either void the
authorization or refund the captured amount. Because this implementation
collapses lifecycle and payment into one enum (R11), the transition has no
visibility into whether money has moved — the same `'cancelled'` edge means
"abandon an unpaid order" and "reverse a paid one", and only the first is
implemented.

**Blast radius.** Customers charged for cancelled orders; chargebacks and manual
reconciliation. Also a compliance problem — the order history shows no refund
because none happened.

**Fix.** Branch on the payment dimension inside the same transaction as the
state change, and record the outcome as an event:

```ts
if (newStatus === 'cancelled') {
  await this.restoreStockForOrder(manager, order);

  // Cancelling an order whose funds are already captured must reverse them in
  // the same transaction as the state change — otherwise a cancelled order
  // silently keeps the customer's money.
  if (order.paymentStatus === 'captured') {
    await this.paymentsService.refundPayment(
      order.id,
      order.totalCents,
      'Order cancelled',
      manager,
    );
    order.paymentStatus = 'refunded';
  }
}
```

Once R13 lands and the port grows `void`, an authorized-but-uncaptured order
must be **voided** rather than refunded — voiding avoids provider fees and does
not create a settlement/clawback pair. Leave a `TODO` referencing R13 so the
distinction isn't lost.

Also decide, explicitly, whether `processing → cancelled` should remain legal at
all once fulfillment exists; under the skill's model cancellation after
fulfillment begins is a return, not a cancel.

**Verification.** Coverage plan §5.3.

---

## R8 — Stock restoration races 🟠

**Symptom.** Two concurrent cancellations of the same order, or a cancellation
racing a checkout of the same variant, can lose an increment — stock drifts
below true inventory.

**Root cause.** Classic read-modify-write without a lock
(`orders.service.ts:279-285`):

```ts
const variant = await manager.findOne(ProductVariant, {
  where: { id: item.variantId },
});
if (variant) {
  variant.stock += item.quantity;
  await manager.save(ProductVariant, variant);
}
```

Checkout does take the lock on the same rows
(`checkout.service.ts:72-75`, `lock: { mode: 'pessimistic_write' }`), so the
correct pattern was already established in the codebase and simply not carried
across to the cancel path — likely because cancellation reads as an
"undo" rather than a contended write.

The `manager: any` signature is a contributing factor: it disables the type
checking that would make the asymmetry with checkout visible, and it is the
source of six of the ten non-auto-fixable lint errors in R19.

**Blast radius.** Oversell (stock reads higher than reality) or phantom
stockouts. Silent — there is no signal until inventory is reconciled by hand.

**Fix.** Type the parameter and take the same lock:

```ts
private async restoreStockForOrder(
  manager: EntityManager,
  order: Order,
): Promise<void> {
  if (!order.items?.length) return;

  // Same pessimistic_write lock checkout takes on these rows: without it two
  // concurrent cancels (or a cancel racing a checkout) lose an increment.
  // Sorted by variantId for the same lock-ordering reason as checkout.
  const items = [...order.items]
    .filter((i) => i.variantId)
    .sort((a, b) => a.variantId.localeCompare(b.variantId));

  for (const item of items) {
    const variant = await manager.findOne(ProductVariant, {
      where: { id: item.variantId },
      lock: { mode: 'pessimistic_write' },
    });
    if (variant) {
      variant.stock += item.quantity;
      await manager.save(ProductVariant, variant);
    }
  }
}
```

Sorting matters for the same reason it does in checkout
(`checkout.service.ts:66`): a cancel and a checkout touching two shared variants
in opposite orders deadlock. Consistent global ordering across *all* variant
locks is the invariant — worth stating in a comment at both sites.

An `UPDATE … SET stock = stock + $1` would also be atomic and avoids the lock,
but the lock keeps the two paths symmetric and readable.

**Verification.** Coverage plan §5.3 and §6 (concurrent cancel + cancel: stock
restored once, not twice).

---

## R10 — Guest order token compared non-constant-time 🟡

**Symptom.** None observable. This is a defence-in-depth gap.

**Root cause.** `orders.service.ts:141-145` compares the stored and supplied
token hashes with `!==`:

```ts
if (!order || !order.guestAccessTokenHash ||
    order.guestAccessTokenHash !== tokenHash) {
```

The repo's convention elsewhere is constant-time comparison of secret material.
Practical exploitability is remote — the comparison is over SHA-256 hex digests,
so a timing oracle leaks information about the *hash*, not the token, and
inverting it is infeasible. It is still the wrong default, and the cost of doing
it right is one line.

**Fix.**

```ts
import { timingSafeEqual } from 'node:crypto';

const supplied = Buffer.from(tokenHash, 'hex');
const stored = order?.guestAccessTokenHash
  ? Buffer.from(order.guestAccessTokenHash, 'hex')
  : null;

if (!order || !stored || stored.length !== supplied.length ||
    !timingSafeEqual(stored, supplied)) {
  throw new CodedNotFoundException(ErrorCode.ORDER_NOT_FOUND, 'Order not found');
}
```

`timingSafeEqual` throws on length mismatch, hence the explicit length check
first.

While here: reuse `hashRefreshToken` from `common/utils/refresh-token-crypto.ts`
rather than the inline `crypto.createHash('sha256')` at
`orders.service.ts:133` — or, better, rename it to a neutral `sha256Hex` and use
it in both places, so there is one hashing helper rather than two.

**Verification.** Coverage plan §2.4 — and keep the assertion behavioural
(wrong token yields `ORDER_NOT_FOUND`, never a code that distinguishes
"order exists" from "bad token") rather than asserting on the implementation.

---

# Batch 3 — Conventions and hygiene

## R9 — `UpdateTenantSettingsDto` has no error codes 🟠

**Root cause.** Both `CLAUDE.md` §6 and the backend-engineer skill state that
every `class-validator` decorator must carry
`message: field(ErrorCode.<NAME>)`. Every other DTO in the repo complies —
customers, merchant-admins, products, carts, customer-addresses, checkout, and
orders all do. `UpdateTenantSettingsDto` is the single exception:

```ts
@IsOptional()
@IsBoolean()          // ← no message
allowGuestCheckout?: boolean;
```

It went unnoticed because the DTO-convention tests are **per-module**
(`customers/__tests__/dto-validation-codes.spec.ts`,
`merchant-admins/__tests__/dto-validation-codes.spec.ts`,
`products/__tests__/dto.spec.ts`) and a new module simply arrived without one.
A convention enforced by opt-in tests is enforced only for modules that
remembered to opt in.

**Blast radius.** Client-visible: this endpoint returns raw `class-validator`
English strings instead of a stable machine-readable code, breaking the
error-envelope contract in `docs/design/error-handling.md`.

**Fix.** Add the codes (`IS_BOOLEAN` already exists in the enum):

```ts
@IsBoolean({ message: field(ErrorCode.IS_BOOLEAN) })
allowGuestCheckout?: boolean;
```

`platformFeePercent` is removed entirely by R5.

**Prevention.** Replace the three per-module specs with one repo-wide sweep —
coverage plan §4. It globs `src/**/dto/*.dto.ts`, reads `class-validator`'s
metadata storage, and asserts every constraint on every DTO carries a
resolvable `ErrorCode`. That makes the rule self-enforcing for DTOs that don't
exist yet, which is the actual failure mode here.

## R18 — Unvalidated status parameters 🟡

**Root cause.** Two related gaps:

- `MerchantAdminsOrdersController.getMerchantOrders(@Query('status') status?: string)`
  passes the raw string into `where: any` (`orders.service.ts:243-246`).
  Parameterized, so not injectable — but an unknown status returns `200 []`
  rather than `400`, which reads to a client as "no orders" rather than
  "you sent a bad filter".
- `UpdateOrderStatusDto.status` is `@IsString()` with no `@IsIn`. The transition
  table rejects unknown values via its `?? []` fallback, so the outcome is
  correct — but the error is `INVALID_ORDER_STATUS_TRANSITION` ("can't go from
  paid to blorp") rather than a validation failure, which is misleading.

Both stem from order status being an untyped `string` end to end — entity
column, DTO, service parameter, and transition table keys.

**Fix.** Introduce the union type next to the entity and use it everywhere:

```ts
// order.entity.ts
export const ORDER_STATUSES = [
  'pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
```

```ts
// update-order-status.dto.ts
@IsIn(ORDER_STATUSES, { message: field(ErrorCode.IS_IN) })
status!: OrderStatus;
```

Add an `OrderQueryDto` for the list endpoint modelled on `ProductQueryDto`
(which already pairs `@IsIn` with pagination) — this composes with R16.

Then type `transitionStatus(orderId: string, newStatus: OrderStatus, …)` and
`VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]>` so the transition table
becomes exhaustiveness-checked by the compiler.

Note this is a stopgap: R11 replaces the single enum with three dimensions.
Typing it now still pays off, because it makes R11's refactor compiler-guided.

## R19 — Lint fails 🟡

`eslint "{src,test}/**/*.ts"` reports **20 errors**; `pnpm lint` runs with
`--fix`, which clears the 10 prettier ones, leaving 10 real errors:

| Error | Location | Fix |
| --- | --- | --- |
| `'OrderEvent' is defined but never used` | `orders.service.spec.ts:9` | delete import |
| `'opts' is defined but never used` | `orders.service.spec.ts:163` | prefix `_opts` or drop |
| 6× `no-unsafe-*` | `orders.service.ts:279-284` | resolved by R8's `EntityManager` typing |
| `no-unsafe-member-access` / `no-unsafe-assignment` | `orders.service.ts:245,249` | type the `where` as `FindOptionsWhere<Order>` instead of `any` |
| `no-unnecessary-type-assertion` | `merchant-admins-auth-error-format.e2e-spec.ts:135` | drop the assertion |

**Root cause.** No CI gate on lint. `pnpm lint`'s `--fix` also means a developer
running it locally sees fewer errors than a clean checkout would.

**Fix.** Fix the ten, then gate CI on a **non-fixing** invocation:

```jsonc
"lint": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix",
"lint:check": "eslint \"{src,apps,libs,test}/**/*.ts\" --max-warnings=1000"
```

CI runs `lint:check`. Ratchet `--max-warnings` down over time; 848 warnings is
too many to fix in this batch but should not be allowed to grow.

## R20 — Dead test file 🟡

`test/orders-e2e.spec.ts` contains exactly `import './orders.e2e-spec';`.

**Root cause.** The unit Jest config sets `rootDir: "src"`, so it never scans
`test/`; the e2e config's `testRegex` is `.e2e-spec.ts$`, and
`orders-e2e.spec.ts` does not match it. The file is executed by **no runner** —
presumably an attempt to make `pnpm test` pick up the orders e2e suite that
silently did nothing.

**Fix.** Delete it. If running e2e specs from the unit runner is genuinely
wanted, that's a Jest project config change, not a re-export shim.

## R21 — Unused `expires_at` column 🟡

`Order.expiresAt` is declared on the entity and created by the migration, but is
never read or written anywhere in `src/`. The `ORDER_EXPIRED` error code exists
in the shared enum and is likewise never thrown — so the intent (expire
unpaid `pending_payment` orders and release their reservations) was designed but
not built.

**Fix.** Pick one deliberately:

- **Build it** — a scheduled job that expires stale `pending_payment` orders and
  restores stock. Per the skill, the job payload must carry `tenantId` and
  re-establish tenant context in the worker before any DB access.
- **Remove it** — drop the column and the error code until the feature is real.

Leaving a nullable column that nothing populates is the worst of the three: it
looks like a working feature to the next reader.

---

# Batch 4 — Schema quality and API shape

## R14 — No indexes on any of the seven new tables 🟠

**Symptom.** Every order query is a sequential scan. Fine at current data
volumes; degrades superlinearly and will surface as a slow storefront long
after the cause is forgotten.

**Root cause.** `1722510000000-CreateOrderAndCheckoutTables` creates seven
tables and **zero** indexes beyond the `(tenant_id, id)` primary keys. TypeORM's
`migration:generate` emits indexes only from `@Index` decorators, and none of
the seven entities declares one. The skill is explicit — "composite indexes lead
with `tenant_id`"; "a bare index on a non-tenant column is near-useless" — but
the rule is about *ordering* and reads as satisfied when there are no indexes to
order.

Every hot path is uncovered:

| Query | Site | Needs |
| --- | --- | --- |
| customer's orders, newest first | `orders.service.ts:212-216` | `(tenant_id, customer_id, created_at DESC)` |
| merchant orders filtered by status | `orders.service.ts:248-252` | `(tenant_id, status, created_at DESC)` |
| merchant orders unfiltered | same | `(tenant_id, created_at DESC)` |
| items/events/payments for an order | several | `(tenant_id, order_id)` on each child |
| captured payment for an order | `payments.service.ts:95-97` | `(tenant_id, order_id, status)` |
| refunds for a payment | `payments.service.ts:106-108` | `(tenant_id, payment_id)` |

The child-table FKs are `(tenant_id, order_id)` composites, which PostgreSQL
does **not** index automatically — so cascading deletes are also unindexed.

**Fix.** One new migration, `AddOrderAndPaymentIndexes`, plus matching
`@Index` decorators on the entities so `migration:generate` doesn't propose
dropping them later.

```ts
public async up(queryRunner: QueryRunner): Promise<void> {
  await queryRunner.query(`CREATE INDEX "orders_tenant_customer_created_idx"
    ON "orders" ("tenant_id", "customer_id", "created_at" DESC)`);
  await queryRunner.query(`CREATE INDEX "orders_tenant_status_created_idx"
    ON "orders" ("tenant_id", "status", "created_at" DESC)`);
  await queryRunner.query(`CREATE INDEX "orders_tenant_created_idx"
    ON "orders" ("tenant_id", "created_at" DESC)`);

  await queryRunner.query(`CREATE INDEX "order_items_tenant_order_idx"
    ON "order_items" ("tenant_id", "order_id")`);
  await queryRunner.query(`CREATE INDEX "order_events_tenant_order_created_idx"
    ON "order_events" ("tenant_id", "order_id", "created_at")`);

  await queryRunner.query(`CREATE INDEX "payments_tenant_order_status_idx"
    ON "payments" ("tenant_id", "order_id", "status")`);
  await queryRunner.query(`CREATE INDEX "settlements_tenant_payment_idx"
    ON "settlements" ("tenant_id", "payment_id")`);
  await queryRunner.query(`CREATE INDEX "settlements_tenant_order_idx"
    ON "settlements" ("tenant_id", "order_id")`);
  await queryRunner.query(`CREATE INDEX "refunds_tenant_payment_idx"
    ON "refunds" ("tenant_id", "payment_id")`);
  await queryRunner.query(`CREATE INDEX "refunds_tenant_order_idx"
    ON "refunds" ("tenant_id", "order_id")`);
}
```

Entity side, e.g.:

```ts
@Index('orders_tenant_customer_created_idx', ['tenantId', 'customerId', 'createdAt'])
@Index('orders_tenant_status_created_idx',   ['tenantId', 'status', 'createdAt'])
@Entity({ name: 'orders' })
export class Order extends TenantEntityBase { … }
```

Also consider a partial index on `guest_access_token_hash` if guest lookup ever
moves to token-first; today it is an id lookup on the PK, so it is not needed.

**Prevention.** Extend `src/db/__tests__/entity-metadata.spec.ts` — which
already enumerates every tenant-scoped table — with an assertion that any
column used as a query filter in a `@Index` is tenant-leading, and that each
tenant-scoped table declares at least one index beyond its PK. That converts a
review-time rule into a test.

## R15 — `tenant_settings` permits multiple rows per tenant 🟠

**Root cause.** The table's primary key is `(tenant_id, id)` — inherited from
`TenantEntityBase`, which is designed for tables with *many* rows per tenant.
`tenant_settings` is a **singleton per tenant** and needed a
`UNIQUE (tenant_id)` that was never added.

The service compounds it: `getSettings` does
`em.findOne(TenantSettings, { where: {} })` — an unordered "give me any row" —
and creates one if absent (`tenant-settings.service.ts:16-25`), with no upsert
and no unique constraint to lose against. Two concurrent first-requests both
read `null` and both insert.

`updateSettings` has the same read, so once two rows exist an update can
persistently modify a different row than `getSettings` returns — the setting
would appear not to save.

Note this is the same race `carts` already solved: partial unique indexes plus a
savepoint-and-re-read recovery in `findOrCreateCart`
(`carts.service.ts:233-252`). The pattern exists; it just wasn't applied here.

**Fix.**

Migration:

```sql
-- Collapse any duplicates first, keeping the oldest row per tenant.
DELETE FROM "tenant_settings" a
 USING "tenant_settings" b
 WHERE a.tenant_id = b.tenant_id
   AND a.created_at > b.created_at;

CREATE UNIQUE INDEX "tenant_settings_tenant_uidx"
  ON "tenant_settings" ("tenant_id");
```

Migrations run as `app_owner` and never call `withTenant`, so with RLS `FORCE`d
the `DELETE` matches zero rows while the index build reads every row — the same
trap documented in `1785310000000-AddCartsActiveUniqueIndexes`. Use the same
`NO FORCE` / `FORCE` bracket, inside the one transaction:

```ts
await queryRunner.query(`ALTER TABLE "tenant_settings" NO FORCE ROW LEVEL SECURITY`);
await queryRunner.query(`DELETE FROM "tenant_settings" a USING … `);
await queryRunner.query(`ALTER TABLE "tenant_settings" FORCE ROW LEVEL SECURITY`);
await queryRunner.query(`CREATE UNIQUE INDEX "tenant_settings_tenant_uidx" …`);
```

Service — make creation idempotent rather than check-then-insert:

```ts
await em
  .createQueryBuilder()
  .insert()
  .into(TenantSettings)
  .values({ tenantId, allowGuestCheckout: true, platformFeePercent: 2.5 })
  .orIgnore()          // ON CONFLICT DO NOTHING
  .execute();

return em.findOneOrFail(TenantSettings, { where: {} });
```

**Also fix `numeric` → string.** PostgreSQL returns `numeric(5,2)` as a
**string** through `pg`; TypeORM does not coerce it without a transformer. So
`settings.platformFeePercent` is typed `number` but is `'2.50'` at runtime.
`order.totalCents * ('2.50' / 100)` works by JS coercion, which is why nothing
has broken — but any `.toFixed()`, strict comparison, or `JSON` round-trip will
misbehave, and the type is a lie.

```ts
@Column({
  name: 'platform_fee_percent', type: 'numeric', precision: 5, scale: 2,
  default: 2.5,
  transformer: {
    to: (v: number) => v,
    from: (v: string | null) => (v === null ? v : Number(v)),
  },
})
platformFeePercent!: number;
```

**Verification.** Coverage plan §5.6.

## R16 — Order list endpoints are unpaginated 🟡

**Root cause.** `getCustomerOrders` and `getMerchantOrders`
(`orders.service.ts:210-254`) return every matching row with
`relations: { items: true }` eagerly joined. `ProductsService.findAll`
(`products.service.ts:182-231`) already implements the house pattern —
`ProductQueryDto` with validated `page`/`limit`, `skip`/`take`, and
`getManyAndCount()` returning `{ items, total, page, limit }` — so orders simply
didn't follow it. `rest-api-design` requires pagination on collections.

For a merchant with a year of orders this is an unbounded response and an
unbounded join.

**Fix.** Add `OrderQueryDto` mirroring `ProductQueryDto` (same `@IsInt`/`@Min`/
`@Max(100)` bounds, plus the `@IsIn(ORDER_STATUSES)` filter from R18), switch
both methods to `findAndCount`, and return the same
`{ items, total, page, limit }` envelope. Land it together with R14 so the new
indexes actually serve the paged queries.

## R17 — Currency is hardcoded 🟡

`checkout.service.ts:121` sets `currencyCode: 'USD'` on every order, in a
marketplace that has a `currencies` table and per-tenant settings, and where the
skill calls out per-tenant currency config as a day-one concern.

**Fix.** Add `default_currency_code` to `tenant_settings` (FK to `currencies`,
default `'USD'`), read it from the settings object R3 already loads once, and
stamp it on the order and payment. Assert the cart's variant prices are
denominated in that currency — a price snapshot in the wrong currency is worse
than a rejected checkout.

---

# Batch 5 — Architectural drift (redesign, not patch)

These three are one body of work. They should be planned together, because
fixing any one in isolation forces rework of the others.

## R11 — The order state machine is one flat enum

**Root cause.** The implementation models a single `status` progressing
`pending_payment → paid → processing → shipped → delivered`, which interleaves
three independent concerns. The skill specifies three coordinated sub-machines
persisted as separate columns:

1. `status` — `pending → confirmed → completed | cancelled`
2. `payment_status` — `pending → authorized → partially_captured → paid →
   partially_refunded | refunded | disputed | charged_back …`
3. `fulfillment_status` — **derived by aggregation** from a `shipments`
   sub-entity, never set directly.

The current model cannot represent states the domain genuinely has: *paid but
unfulfilled* (the `paid`/`processing` distinction is doing this job informally),
*fulfilled then partially refunded*, or *delivered then disputed weeks later*.
There is a `payment_status` column, but it moves independently and ad hoc rather
than as a guarded machine — `checkout.service.ts:171-172` sets both `status` and
`paymentStatus` inline with no transition check.

Missing entirely: the `shipments` entity, partial/multi-shipment fulfillment,
per-store `captureMode` (`authorize_then_capture` vs `immediate`), and partial
capture.

Structurally, the skill also requires the machine be **a pure domain function**
— `(state, event) => nextState | IllegalTransition` — unit-testable with no
database, with persistence and `withTenant` wrapped *around* it. Here the table
is a module-level constant inside a service whose every method opens a
transaction, so transition logic cannot be tested without mocking an
`EntityManager`.

R7 (cancel doesn't refund) is a direct symptom: the transition has no way to ask
"has money moved?" because lifecycle and payment share one column.

**Fix — outline.** Needs its own design doc; sketch:

1. Extract `src/orders/domain/` — pure transition tables for lifecycle and
   payment, plus a `deriveFulfillmentStatus(shipments)` aggregator. No TypeORM
   imports. This lands first and is independently valuable.
2. Add the `shipments` / `shipment_items` tables with `tenant_id`, RLS `FORCE`,
   policy, and tenant-leading indexes.
3. Add `fulfillment_status` to `orders`, recomputed inside every transition,
   never assigned by callers.
4. Add `capture_mode` to `tenant_settings`.
5. Migrate existing rows: `paid`/`processing`/`shipped`/`delivered` map onto
   `(status, payment_status, fulfillment_status)` triples. Write the mapping
   table into the migration's comments — it is the part future readers will need.
6. Update `docs/architecture/architecture.md` **and** the skill in the same
   change, per `CLAUDE.md` §1.

## R12 — No webhook idempotency

**Root cause.** `order_events` lacks `provider_event_id`, and there is no
`UNIQUE (tenant_id, provider_event_id)`. The skill requires this as the dedupe
key so a redelivered provider event is a no-op. `PaymentsController.handleWebhook`
is a stub — `{ received: true }`, no signature verification, no dedupe, no tenant
attribution (`payments.service.ts:146-149`).

This is latent rather than active: the mock provider never calls back. It becomes
a live double-fulfilment bug the day a real provider is wired in, and providers
redeliver by design.

Also note the webhook route sits behind `TenantResolutionMiddleware`, so a real
provider POSTing to a platform hostname would 404 before reaching the handler.
Per D2a, adding an exclusion is a tenancy decision: the route must set CLS itself
from a verified source — here, the tenant resolved from the normalized event's
`merchantAccount` ref, after signature verification.

**Fix.** Add `provider_event_id` + the unique constraint; implement the flow the
skill specifies — `parseEvent` → dedupe on `providerEventId` → resolve tenant
from the merchant account ref → `withTenant` → apply the transition. Verification
and normalization in the adapter; dedupe and `withTenant` in the controller.

## R13 — `PaymentProvider` is not the specified `PaymentPort`

**Root cause.** The interface was written to the mock's needs rather than to
`docs/architecture/references/d7-payment-port.md`. Gaps:

| Required | Present |
| --- | --- |
| `idempotencyKey` on every mutating call | ✗ |
| `Money` = integer minor units + currency | ✗ — loose `amountCents` + `currencyCode` pairs |
| `authorize` / `capture` / `void` split | ✗ — one `processPayment` |
| `platformFee` first-class in `authorize` | ✗ — computed after the fact in the service |
| `parseEvent(raw, headers) => NormalizedEvent` | ✗ |
| Merchant onboarding / KYC | ✗ |
| Per-tenant adapter resolution | ✗ — `provider: 'mock'` hardcoded at `payments.service.ts:46` |
| Normalized error taxonomy with `retryable` | ✗ |

`payment_providers` and `payment_provider_configs` tables already exist from
`InitialMigration` — the data model anticipated per-tenant provider selection
that the code doesn't use.

The port is otherwise well-behaved: it is injected by token
(`PAYMENT_PROVIDER_TOKEN`), no vendor SDK leaks, and `PaymentsService` depends
only on the interface. So the abstraction *boundary* is right; the *contract* is
under-specified. The skill flags this as "the part of the abstraction most
likely to leak", and recommends designing against two hypothetical providers, not
one — worth doing explicitly before a real adapter is written, because a
differing callback shape must not force a redesign.

**Fix.** Rewrite the interface to D7 before the first real adapter, and add a
`registry.forTenant(tenantId) => PaymentPort` resolver backed by
`payment_provider_configs`. Doing this *after* a Stripe/Adyen adapter exists
means rewriting both.

---

## Cross-cutting themes

Four patterns produced most of the above; each is worth an explicit guard rather
than a note in a review.

| Theme | Findings | Guard |
| --- | --- | --- |
| **A convention lived in one module, not in shared code** | R4 (cart ownership), R8 (lock discipline), R15 (savepoint/unique race) | Export the predicate/helper; don't rely on the next module rediscovering it |
| **Per-module opt-in tests can't enforce repo-wide rules** | R9 (DTO codes), R14 (indexes) | Metadata-sweep tests that enumerate *all* DTOs / entities |
| **Nothing exercised the from-scratch path** | R1, R2 | `db:verify-fresh` in CI |
| **Validation checked bounds, not domain values** | R5, R6, R18 | Typed value objects (`Money`, `OrderStatus`) + DB `CHECK` backstops |

## Verification checklist

Before calling the remediation done:

- [ ] `pnpm --filter @tiny-threads/api db:verify-fresh` — green
- [ ] `typeorm migration:show` — nothing pending on dev and test
- [ ] `pnpm build` — green
- [ ] `pnpm lint:check` — zero errors
- [ ] `pnpm test` — green, with the new regression tests from the coverage plan
- [ ] `pnpm test:e2e` — green, including RLS specs for all seven new tables
- [ ] `pnpm --filter @tiny-threads/api db:verify-rls` — green
- [ ] `docs/architecture/architecture.md` updated if Batch 5 lands (per `CLAUDE.md` §1,
      the skill must be updated in the same change)
