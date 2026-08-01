# `apps/api` Test Coverage Plan

Status: proposed (2026-08-01). Baseline: 46 unit suites / 389 tests passing,
67.93% statements overall; 11 e2e specs.

This plan closes the coverage gaps found reviewing the commerce modules added in
`4c29778`, `27c0a38`, and `801a724` (carts, checkout, payments, orders,
tenant-settings). It is ordered by risk, not by module.

Companion doc: the review findings themselves are tracked separately; several
items below are written as **regression tests for known open bugs** and are
marked 🐛. Those tests should be written to assert the *correct* behaviour and
will fail until the bug is fixed.

---

## Phase 0 — Guardrails that would have caught the worst bugs

### 0.1 Migrate-from-scratch check (CI + local) 🐛

**Gap:** nothing verifies the schema can be built from zero. The `pretest` /
`pretest:e2e` hooks migrate a *long-lived* container that already holds state,
so an unrunnable migration set passes every existing check. This is why the
`1722510000000-CreateOrderAndCheckoutTables` ordering bug (it sorts before
`InitialMigration`, so its FK to `tenants` fails) is invisible today.

**Add:** `apps/api/scripts/db-verify-fresh.sh` — create a throwaway database,
run `migration:run` against it, run `db:verify-rls`, drop it. Non-zero exit on
any failure.

```sh
# sketch
DB="tt_fresh_$$"
psql -c "CREATE DATABASE \"$DB\" OWNER app_owner"
DATABASE_URL_MIGRATIONS=".../$DB" typeorm migration:run -d ./src/db/data-source.ts
DATABASE_URL=".../$DB" pnpm db:verify-rls
psql -c "DROP DATABASE \"$DB\""
```

Wire as `pnpm --filter @tiny-threads/api db:verify-fresh` and run it in CI on
every PR that touches `src/db/migrations/`.

**Also assert (cheap unit test, `src/db/__tests__/migration-order.spec.ts`):**

- every migration filename timestamp is strictly increasing in `readdir` order,
  and the numeric prefix matches the class-name suffix;
- no migration body contains an unconditional `DROP TABLE` of a table it does
  not create in the same `up()` (catches the destructive
  `DROP TABLE IF EXISTS "refunds", ... CASCADE` preamble).

### 0.2 Lint must be clean 🐛

`eslint src test` currently reports **20 errors** (10 not auto-fixable):
unused `OrderEvent` / `opts` in `orders.service.spec.ts`, and a cluster of
`no-unsafe-*` originating from `restoreStockForOrder(manager: any, …)`.
Gate CI on `eslint` with `--max-warnings` left as-is but zero errors.

### 0.3 Delete dead test file

`test/orders-e2e.spec.ts` is a one-line `import './orders.e2e-spec';`. The unit
config has `rootDir: src` (never sees `test/`) and the e2e `testRegex` is
`.e2e-spec.ts$`, which `orders-e2e.spec.ts` does not match. It is executed by
no runner. Delete.

---

## Phase 1 — RLS proof for the seven new tenant tables (⚠️ skill-mandated)

**Gap:** the backend-engineer skill requires, for *each* new tenant-scoped
table, an e2e test proving **both** policy halves against a real database:

- `USING` — a row is invisible under another tenant's context;
- `WITH CHECK` — a write stamped with another tenant's `tenant_id` is rejected,
  asserted against the actual `violates row-level security policy` error
  (SQLSTATE **42501**), not merely "it threw" — an incidental FK failure would
  otherwise pass for RLS.

Existing RLS e2e specs cover `customer_refresh_tokens`,
`merchant_user_refresh_tokens`, products/variants/categories, and
carts/cart_items/customer_addresses. **None of the seven tables added by the
orders/checkout/payments work are covered:** `tenant_settings`, `orders`,
`order_items`, `order_events`, `payments`, `settlements`, `refunds`.

`src/db/verify-rls.ts` proves a policy *exists*; it does not prove it *works*.

**Add:** `test/orders-payments-rls.e2e-spec.ts`, modelled on
`test/carts-customer-addresses-rls.e2e-spec.ts`.

For each of the seven tables:

| Case | Assertion |
| --- | --- |
| Cross-tenant read | Seed a row under tenant A; `withTenant(B)` read returns `undefined`/`[]` |
| Cross-tenant write | `withTenant(B)` insert stamped `tenant_id = A` rejects with SQLSTATE `42501` |
| Cross-tenant update | `withTenant(B)` update of A's row affects 0 rows |
| Cross-tenant delete | `withTenant(B)` delete of A's row affects 0 rows |
| Same-tenant control | `withTenant(A)` sees exactly its own row (guards against a policy that denies everything) |

Additionally, one **join-path** case: an `order_items` row must not be
reachable via an `orders` join from another tenant — child tables are the
classic RLS blind spot.

---

## Phase 2 — Security-invariant regression tests

These encode invariants the review found broken. Write them first; they
document the intended contract.

### 2.1 Checkout must not accept another actor's cart 🐛

`CheckoutService.checkout` resolves the cart by `dto.cartId` alone, with no
ownership predicate — unlike `CartsService`, which is careful about the
one-owner invariant (`activeCartWhere`, `getActiveCart`).

**Unit** (`src/checkout/__tests__/checkout.service.spec.ts`):

- authenticated customer A submits customer B's `cartId` → rejects (404/403),
  no `Order` saved, no stock decrement, B's cart still `active`;
- guest submits a customer-owned `cartId` → rejects;
- guest submits a *different* guest session's `cartId` → rejects;
- owner submits own cart → succeeds (control).

**E2E** (`test/checkout.e2e-spec.ts`, new): two real customers in one tenant;
A `POST /checkout` with B's cart id → non-2xx, and B's cart contents are absent
from the response body.

### 2.2 Refund amount bounds 🐛

`RefundOrderDto.amountCents` is `@IsNumber()` only; `PaymentsService`
validates the upper bound but never the lower.

- `amountCents: -5000` → 400 `VALIDATION_FAILED`, no `Refund` row;
- `amountCents: 0` → 400;
- `amountCents: 10.5` → 400 (must be integer minor units);
- negative refund must not be able to walk an order's `paymentStatus` back from
  `refunded` to `partially_refunded` (`orders.service.ts` sums refunds);
- cumulative refunds across *multiple* calls cannot exceed the captured amount
  (existing test covers a single call only).

### 2.3 Platform fee is not merchant-writable 🐛

`PATCH /merchant-admins/settings` lets an `owner`/`admin` set
`platformFeePercent` with no bounds.

- merchant admin sets `platformFeePercent: 0` → rejected (or ignored);
- `-10` and `150` → 400;
- settlement math: assert `platformFeeCents >= 0` and
  `merchantNetAmountCents <= grossAmountCents` for any accepted settings value.

### 2.4 Guest order token

- missing / empty / wrong token → `ORDER_NOT_FOUND` (never a different code
  that would distinguish "order exists" from "bad token");
- valid token for order X must not open order Y;
- comparison is constant-time (assert `crypto.timingSafeEqual` is used, matching
  `common/utils/refresh-token-crypto.ts`).

### 2.5 Cross-customer order access

- customer A `GET /customers/orders/:id` with B's order id → 404;
- guest order endpoint cannot return a customer-owned order;
- `merchant-admins/orders` rejects `staff` role (only `owner`/`admin` allowed).

---

## Phase 3 — Controller layer (currently 0% across six modules)

Coverage report: `orders/controllers/*` 0%, `payments.controller.ts` 0%,
`tenant-settings.controller.ts` 0%, `checkout.controller.ts` 0%,
`carts.controller.ts` 0%, `customer-addresses.controller.ts` 0%.

`products/__tests__/merchant-controllers.spec.ts` and
`storefront-controllers.spec.ts` are the pattern to copy (mocked service,
assert delegation + argument shaping + guard metadata).

**Add:**

| File | Covers |
| --- | --- |
| `src/orders/__tests__/orders-controllers.spec.ts` | all 3 order controllers |
| `src/checkout/__tests__/checkout.controller.spec.ts` | `CheckoutController` |
| `src/payments/__tests__/payments.controller.spec.ts` | webhook controller |
| `src/tenant-settings/__tests__/tenant-settings.controller.spec.ts` | settings controller |
| `src/carts/__tests__/carts.controller.spec.ts` | 235 uncovered lines — session-id handling is security-relevant |
| `src/customer-addresses/__tests__/customer-addresses.controller.spec.ts` | 117 uncovered lines |

Per controller, assert:

- **guard metadata** — `Reflect.getMetadata('__guards__', Ctor)` contains the
  expected guards, and `@Roles(...)` carries the expected roles. This is the
  cheapest possible defence against someone deleting a guard;
- the actor id is read from `req.user.sub` and **not** from any client-supplied
  body/query field;
- service delegation with exact arguments;
- `CartsController` specifically: `x-guest-session-id` is rejected when not a
  UUID, is ignored for authenticated customers, and a fresh id is minted +
  returned as `X-Guest-Session-ID` on first anonymous access.

---

## Phase 4 — DTO validation-code specs

**Gap:** `customers`, `merchant-admins`, and `products` each have a spec that
walks every DTO and asserts every constraint carries an explicit
`message: field(ErrorCode.…)`. The five newer modules have none — which is
exactly why `UpdateTenantSettingsDto` shipped with bare `@IsBoolean()` /
`@IsNumber()` and no error codes, violating a mandatory convention. 🐛

**Add** a single shared spec rather than five copies —
`src/common/errors/__tests__/dto-error-codes.spec.ts`:

1. glob every `src/**/dto/*.dto.ts`;
2. for each exported DTO class, read `class-validator`'s metadata storage;
3. assert every constraint has a `message` and that the message parses as a
   known `ErrorCode` via `field()`'s encoding.

This makes the rule self-enforcing for all *future* DTOs, and immediately fails
on `UpdateTenantSettingsDto`.

Keep per-module specs for value-level cases the generic sweep can't express
(`CheckoutDto` requires a UUID `cartId`; `UpdateOrderStatusDto.status` should be
`@IsIn` over the legal statuses; `RefundOrderDto.amountCents` bounds).

---

## Phase 5 — Service-level gaps

### 5.1 `OrdersService` (77% stmts, **57.89% funcs**; lines 211–270 uncovered)

Untested entirely: `getCustomerOrders`, `getCustomerOrderById`,
`getMerchantOrders`, `getMerchantOrderById`.

- `getCustomerOrders` — scoped to the customer, `createdAt DESC`, items joined,
  empty array when none;
- `getCustomerOrderById` — another customer's id → `ORDER_NOT_FOUND`;
- `getMerchantOrders` — with and without the `status` filter; an unknown status
  string should 400, not silently return `[]` 🐛;
- `getMerchantOrderById` — missing → `ORDER_NOT_FOUND`;
- `getGuestOrder` with an empty token (line 127, uncovered).

### 5.2 Transition table — exhaustive, not sampled

Current tests sample four transitions. Replace with a table-driven test over the
full cross-product of `{pending_payment, paid, processing, shipped, delivered,
cancelled} × {same set}`, asserting exactly the legal edges succeed and every
other pair raises `INVALID_ORDER_STATUS_TRANSITION`. Include:

- terminal states (`delivered`, `cancelled`) accept nothing;
- an unknown current status accepts nothing (the `?? []` fallback);
- every successful transition writes exactly one `OrderEvent` with the right
  `actorType`/`actorId`, and a rejected one writes none.

**Note:** this suite is the natural place to land the three-dimension state
machine when the flat-enum drift (review item #11) is fixed — a pure
`(state, event) => nextState` function is unit-testable with no database, which
is what the skill asks for.

### 5.3 Cancel-side effects 🐛

- cancelling a `paid` order must void/refund the captured payment, not merely
  restore stock and flip the column;
- stock restore must take a `pessimistic_write` lock (checkout does; cancel
  does not) — assert the lock option is passed;
- cancelling an order with no items, and with items whose `variantId` no longer
  resolves, must not throw.

### 5.4 `CheckoutService` (74% branch, **50% funcs**)

- 🐛 **no nested transaction**: assert `tenantDb.run` is called exactly once per
  checkout. Today `tenantSettingsService.getSettings()` is invoked *inside* the
  outer transaction, opening a second pooled connection while `FOR UPDATE`
  locks are held. `carts.service.spec.ts` already has a
  `'should open exactly one tenantDb.run per public method call, never nested'`
  test — reuse that harness verbatim;
- lock ordering: variants are locked in sorted `variantId` order (the
  deadlock-avoidance property at `checkout.service.ts:66`) — assert the order of
  `findOne` calls for a multi-item cart;
- failed payment (`mock_decline`) rolls the whole thing back: no order, no
  order items, stock unchanged, cart still `active`;
- `mock_deferred` (status `pending`) leaves the order in `pending_payment` and
  writes **no** `payment_captured` event — currently unexercised;
- price snapshotting: mutating the variant price after checkout does not change
  `order_items.unit_price_cents`;
- guest checkout returns a raw token whose SHA-256 equals the stored hash, and
  the raw token is never persisted;
- 🐛 currency comes from tenant config, not the hardcoded `'USD'`.

### 5.5 `PaymentsService`

- `handleWebhook` — currently a stub returning `{received: true}`; once
  implemented, test signature verification, `providerEventId` dedupe
  (redelivery is a no-op), and tenant attribution before any write;
- settlement math: rounding at the half-cent boundary
  (`Math.round(total * pct/100)`), and `gross = fee + net` for a spread of
  amounts (property-style over ~100 generated values);
- multiple payments per order — `refundPayment` finds by
  `{orderId, status: 'captured'}` via `findOne` and silently picks one when
  several exist.

### 5.6 `TenantSettingsService`

- 🐛 concurrent first-access must not create two rows (`tenant_settings` has PK
  `(tenant_id, id)` and no `UNIQUE (tenant_id)`, and `getSettings` does
  `findOne({where:{}})`);
- `platformFeePercent` round-trips as a **number**, not the string PostgreSQL
  returns for `numeric` without a transformer.

---

## Phase 6 — Concurrency and integration

`src/db/__tests__/tenant-db.spec.ts` already proves no context bleed across
concurrent `withTenant` calls. Extend to the new hot paths:

| Test | Asserts |
| --- | --- |
| Two concurrent checkouts, same variant, stock = 1 | exactly one succeeds; the other gets `INSUFFICIENT_STOCK`; final stock is 0, never −1 |
| Concurrent checkout of a multi-item cart from two directions | no deadlock (proves the sort-order lock discipline) |
| Concurrent cancel + cancel of the same order | stock restored once, not twice 🐛 |
| Concurrent first-request to `getSettings` for one tenant | one settings row 🐛 |
| N concurrent checkouts where N ≥ pool size | all complete; no pool starvation 🐛 (fails today — see 5.4) |

These belong in e2e (`test/`), against the real test database — a mocked
`EntityManager` cannot prove any of them.

---

## Phase 7 — E2E breadth

`test/orders.e2e-spec.ts` has three broad happy-path scenarios. Add
failure-path e2e coverage, which is where the envelope contract matters:

- `test/checkout.e2e-spec.ts` — guest checkout disabled → 403
  `GUEST_CHECKOUT_DISABLED`; insufficient stock → 400 `INSUFFICIENT_STOCK`;
  converted cart → 400 `CART_EMPTY`; declined payment → 400 `PAYMENT_FAILED`
  with the order absent;
- `test/orders-error-format.e2e-spec.ts` — mirror the existing
  `*-auth-error-format.e2e-spec.ts` pattern: every order/checkout/refund error
  response conforms to `ErrorResponseBody` with the documented `ErrorCode`;
- `test/tenant-settings.e2e-spec.ts` — RBAC (`staff` rejected), bounds
  validation, and settings changes actually affecting checkout behaviour.

---

## Suggested sequencing

1. **Phase 0** — the fresh-migration check and lint gate. Cheap, and 0.1 catches
   a bug that currently blocks every new environment.
2. **Phase 1** — RLS specs. Skill-mandated and the highest-consequence gap.
3. **Phase 2** — security invariants (write them red, then fix the bugs).
4. **Phase 4** — the generic DTO error-code sweep. One file, permanent guard.
5. **Phase 3 / 5** — controller and service breadth.
6. **Phase 6 / 7** — concurrency and e2e failure paths.

## Coverage targets

| Scope | Now | Target |
| --- | --- | --- |
| Overall statements | 67.9% | ≥ 85% |
| `orders/` | 69.8% (57.9% funcs) | ≥ 90% |
| Controllers (all modules) | 0–100%, six at 0% | ≥ 85% each |
| DTOs | 0% for 5 modules | 100% via the generic sweep |
| Tenant-scoped tables with an RLS e2e | 8 of 15 | 15 of 15 |

Coverage percentage is a proxy; Phases 1 and 2 matter more than the number.
