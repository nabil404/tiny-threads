# Authentication & Authorization Design

Spec for implementing email/password + Google OAuth in this platform. Written to be self-contained — read the **Project context** first, then implement against the rules below. Security-critical items are marked **MUST** / **MUST NOT**; treat those as non-negotiable.

This supersedes the earlier draft at `docs/AuthDesign.md`, folding in decisions made during brainstorming (notifications port, token transport, logout scope) **and** a reconciliation against the already-migrated schema (see §0 note below — merchant admins turned out to be tenant-scoped, not the platform-global population originally assumed). Scope: the full flow across both populations, phased per §9's build order — not a partial slice.

---

## Project context (constraints you must respect)

- **Stack:** NestJS · PostgreSQL · TypeScript · TypeORM. Structured as a **modular monolith** organized by bounded context (Catalog, Inventory, Cart/Checkout, Orders, Payments, Customers, Pricing, Shipping, Tax).
- **Tenancy:** multi-tenant e-commerce **marketplace** (dozens of merchants selling to their own customers). **Pooled model** — shared schema with a `tenant_id` discriminator on every tenant-scoped table.
- **Isolation backstop:** PostgreSQL **Row-Level Security (RLS)** is the load-bearing isolation mechanism. The app runtime DB role is a **non-owner, non-superuser** role, and tables use `FORCE ROW LEVEL SECURITY`. Tenant context is set per-transaction via `SET LOCAL app.current_tenant = ...`.
- **Tenant resolution:** resolved early from subdomain (`shop.platform.com`), merchant **custom domain**, or a JWT claim/header for admin & API traffic. Carried through `AsyncLocalStorage` (via `nestjs-cls`).
- **Keys & uniqueness:** primary keys are **UUID v7**. All uniqueness is **composite with `tenant_id`** for tenant-scoped tables (never global).
- **Vendor-agnostic providers:** external capabilities (payments, shipping, tax, notifications, storage, search) are each a domain-owned **port** with adapters at the edge (`docs/architecture/references/d5-ports-adapters.md`). No vendor SDK/type may appear outside its adapter.

---

## 0. The core fork — there are TWO auth populations

Do not build one `users` table. The architecture already separates two populations with different identity semantics:

| | Storefront customers | Merchant admins |
|---|---|---|
| Identity scope | **Tenant-scoped** — same email is two separate accounts under two merchants | **Tenant-scoped** — same email is two separate accounts under two merchants |
| Tenant link | `tenant_id` on the row | `tenant_id` on the row |
| Table location | `customers`, tenant-scoped, under RLS | `merchant_users` (already exists), tenant-scoped, under RLS |
| Guard ordering | Resolve tenant from domain **first**, then authenticate within it | Resolve tenant from domain/admin-subdomain **first**, then authenticate within it |
| Token audience | `aud: "customer"`, carries `tenant_id` | `aud: "merchant_admin"`, carries `tenant_id` |

> **Note (reconciled with existing schema):** the original draft of this spec assumed merchant admins were a platform-global population (one login, many tenants via a `tenant_membership` many-to-many). That doesn't match what's already migrated: `docs/architecture/database-schema.md` classifies `merchant_users` as tenant-scoped by deliberate design, and the only existing global/cross-tenant population is `platform_admins` — Tiny Threads' own internal ops staff, a *different* population from merchant admins and **out of scope for this spec** (no login flow for `platform_admins` is designed here; that would be its own future spec if needed). So both auth populations here are tenant-scoped and structurally symmetric — they share primitives (hashing, OAuth strategy, token utils) and a similar guard shape, but are still two separate flows because they're two separate tables/entities with separate token audiences.

---

## 1. Build vs. buy

- **Customers → roll your own** with Passport (`@nestjs/passport`, `passport-local`, `passport-google-oauth20`, `@nestjs/jwt`). Managed IdPs price per monthly-active-user, which here means *every merchant's entire customer base* — expensive, and per-tenant customer pools are awkward in tools that assume a single global pool.
- **Merchant admins → same reasoning applies**, and more so: since merchant admins are tenant-scoped (not a global population), the "Organizations" mapping that would justify a managed IdP (WorkOS / Auth0 Organizations / Clerk) doesn't apply here — there's no cross-tenant identity to map. Roll your own with the same Passport stack.

This spec uses the **Passport-based** path for both, sharing primitives via `auth-core` (§8).

---

## 2. Data model

Model credentials as their **own table**, separate from the principal. This is what makes "email/password AND Google on the same account" clean, and keeps `password_hash` off the principal row.

### Customer side (tenant-scoped, under RLS)

`customers` already exists (`apps/api/src/db/entities/customers.entity.ts`, from the initial migration): tenant-scoped, composite PK `(tenant_id, id)`, `UNIQUE (tenant_id, email)`, `email` + `name` columns already in place. This spec adds two new tables alongside it:

```
customer_identities
  id                uuid pk (v7)
  tenant_id         uuid not null
  customer_id       uuid not null -> customers.id
  provider          text not null            -- 'password' | 'google'
  provider_subject  text                     -- Google `sub`; NULL for password
  password_hash     text                     -- argon2id; NULL for google
  email_verified    boolean not null default false
  created_at        timestamptz
  UNIQUE (tenant_id, provider, provider_subject)   -- for oauth rows
  UNIQUE (tenant_id, customer_id, provider)         -- one password row per customer

customer_refresh_tokens
  id                uuid pk (v7)
  tenant_id         uuid not null
  customer_id       uuid not null -> customers.id
  token_hash        text not null            -- store HASH, never the token
  family_id         uuid not null            -- for rotation / reuse detection
  expires_at        timestamptz not null
  revoked_at        timestamptz
```

### Merchant admin side (tenant-scoped, under RLS — builds on the existing `merchant_users` table)

`merchant_users` already exists (`apps/api/src/db/entities/merchant-users.entity.ts`, from the initial migration): tenant-scoped, composite PK `(tenant_id, id)`, `UNIQUE (tenant_id, email)`, with `email` and `role` columns already in place. This spec adds two new tables alongside it, mirroring the `customers` / `customer_identities` / `customer_refresh_tokens` shape exactly:

```
merchant_user_identities
  id                uuid pk (v7)
  tenant_id         uuid not null
  merchant_user_id  uuid not null -> merchant_users.id
  provider          text not null            -- 'password' | 'google'
  provider_subject  text                     -- Google `sub`; NULL for password
  password_hash     text                     -- argon2id; NULL for google
  email_verified    boolean not null default false
  created_at        timestamptz
  UNIQUE (tenant_id, provider, provider_subject)   -- for oauth rows
  UNIQUE (tenant_id, merchant_user_id, provider)    -- one password row per merchant user

merchant_user_refresh_tokens
  id                uuid pk (v7)
  tenant_id         uuid not null
  merchant_user_id  uuid not null -> merchant_users.id
  token_hash        text not null            -- store HASH, never the token
  family_id         uuid not null            -- for rotation / reuse detection
  expires_at        timestamptz not null
  revoked_at        timestamptz
```

No `tenant_membership` or global `staff_user` table — `merchant_users.role` (already a column) is the sole role for that merchant user under that tenant; there is no cross-tenant identity to switch between.

- **MUST** apply RLS policies to `customers` / `customer_identities` / `customer_refresh_tokens` **and** `merchant_user_identities` / `merchant_user_refresh_tokens` exactly like every other tenant-scoped table.
- Use **TypeORM entities** as the source of truth; composite indexes lead with `tenant_id` for both the customer and merchant-admin tables (declare via `@Index(['tenantId', ...])`). Prefer explicit TypeORM **migrations** over `synchronize: true` — you need hand-written SQL for the RLS policies anyway.
- **RLS + TypeORM caveat:** the per-transaction `SET LOCAL app.current_tenant = ...` **MUST** run on the same connection as the query. Centralize it in a transaction wrapper that uses a `QueryRunner` (run `SET LOCAL` then the work inside one `queryRunner.startTransaction()`), or an `EntitySubscriberInterface`/custom repository that reads `tenant_id` from `nestjs-cls`. Feature code **MUST NOT** issue `SET LOCAL` itself, and **MUST NOT** rely on `SET` (session-scoped) — it bleeds across pooled connections.

---

## 3. Password handling

- **MUST** hash with **argon2id** (`argon2` package). bcrypt is an acceptable fallback but argon2id is preferred.
- **MUST NOT** log, return, or store plaintext passwords anywhere, including error messages.
- Enforce a sane minimum length (≥12) and check against a breached-password list if feasible; do not impose composition rules that push users toward weak patterns.
- Password reset: single-use, short-TTL token stored **hashed**, delivered by email; invalidate all refresh tokens on reset.
- Email verification: required before a `password` identity is considered `email_verified = true`.

---

## 4. Notifications port (for verification & reset emails)

No notifications module exists in the codebase yet. Define a minimal domain-owned port now, mirroring the worked `PaymentPort` example in `docs/architecture/references/d7-payment-port.md` rather than inventing a new shape:

```
NotificationsPort
  sendEmail(to: string, template: EmailTemplate, data: Record<string, unknown>): Promise<void>
```

- `auth-core` depends on `NotificationsPort` only — never a vendor SDK (SES, Postmark, SendGrid, etc.) directly.
- Ship one adapter for now: a log/console adapter suitable for dev and tests. Wiring a real provider adapter is out of scope for this spec.
- `EmailTemplate` covers at minimum: verification-email, password-reset.

---

## 5. Google OAuth

Use **Authorization Code flow with PKCE**.

### The multi-tenant redirect-URI problem (critical)

Google requires **exact-match** registered redirect URIs. You **cannot** register a wildcard for every merchant subdomain and custom domain.

- **MUST** use a **single centralized callback** on the platform's own domain, e.g. `https://auth.platform.com/oauth/google/callback`, registered once in the Google Cloud console.
- **MUST** carry the originating context in a **signed `state` parameter** (sign it; treat `state` as untrusted on the way back). Also use `state` for CSRF protection as usual. Both populations are tenant-scoped (§0), so `state` has the same shape for each, just tagged with which population it's for: `{ population: 'customer' | 'merchant_admin', tenant_id, returnUrl }` — tenant is already known before redirecting to Google, since guard ordering resolves tenant first for both flows.
- After token exchange at the central callback, redirect the browser back to the originating tenant domain (storefront domain for customers, tenant's admin subdomain for merchant admins) with a short-lived one-time code, then complete the session there.

### Account linking (account-takeover vector — read carefully)

When a user who already has a `password` identity signs in with Google on the same email:

- **MUST** only auto-link the Google identity to the existing account when Google reports **`email_verified = true`**.
- **MUST NOT** auto-link on matching email when the OAuth email is unverified. Instead, require the user to authenticate with their existing password first, then link deliberately. Skipping this lets anyone who can mint an OAuth token for an unverified email take over the account.
- Store the Google `sub` (`provider_subject`), not the email, as the stable identifier — emails change.

---

## 6. Tokens & sessions

- **Access token:** JWT, short-lived (~15 min). **MUST** include an `aud` claim distinguishing populations:
  - customer tokens → `aud: "customer"`, include `tenant_id`.
  - merchant admin tokens → `aud: "merchant_admin"`, include `tenant_id` and the merchant user's `role`.
- **Refresh token:** **opaque random** value (not a JWT). **MUST** be stored **hashed** server-side with **rotation + reuse detection**: on each refresh, issue a new token in the same `family_id` and revoke the old one; if a revoked token in a family is presented, revoke the entire family (theft signal).
- **MUST** validate `aud` on every protected route — a customer token must never be accepted on a merchant-admin route or vice versa.
- Both customer and merchant-admin refresh tokens are tenant-scoped and live under RLS.

### Transport

- **Access token:** returned in the login/refresh response body, held **in memory only** by the frontend — never persisted to storage.
- **Refresh token:** set as an `httpOnly`, `Secure`, `SameSite=Lax` cookie, scoped to whichever domain issued it. This works across arbitrary custom domains because customer login/refresh calls are always made against the tenant's own domain — only the OAuth callback is centralized, and that already hands off via a one-time code (§5) rather than setting a cross-domain cookie.
- Refresh and logout endpoints get a double-submit CSRF token as defense in depth alongside `SameSite`.
- Rationale: an httpOnly cookie makes the long-lived refresh token unreadable by injected JS. A pure Bearer/body approach would require the frontend to persist the refresh token in storage the page's own JS can read — a worse XSS blast radius, since the refresh token (unlike the 15-minute access token) is meant to live for days.

### Logout

- Logout revokes only the refresh token family presented in the request (single device/session). Other logged-in devices/sessions are unaffected.
- A separate "log out everywhere" action, or a password reset, revokes **all** refresh token families for that principal.

---

## 7. Authorization (authz)

- **RLS is NOT authorization.** RLS isolates *tenant data*; it says nothing about whether a role may perform an action (e.g. issue a refund). Keep authz **app-level**.
- **MUST NOT** try to encode business permissions in RLS policies.
- Merchant admin permissions come from **`merchant_users.role`** (already a column on the existing table), baked into the access token's `role` claim at login (§6). The chain is: `JwtAuthGuard` (verify token + `aud`) → `RolesGuard`/policy guard reads the `role` claim directly — no per-request DB lookup, since a merchant user only ever belongs to the one tenant on their row (no tenant-switching needed, unlike the platform-global model originally assumed — see §0 note).
- Customers get their own, simpler RBAC (typically just "is this their own resource").

---

## 8. NestJS module layout

- **`Customers` context** owns the customer auth flow (local + Google strategies, customer JWT, customer refresh tokens).
- A separate **`MerchantAdmins` context** owns merchant admin auth (local + Google strategies, merchant admin JWT, merchant admin refresh tokens), building on the existing `merchant_users` table/entity.
- A small shared **`auth-core`** utility module: argon2 hashing, token signing/verification, refresh-token rotation logic, the signed-`state` helper, and the `NotificationsPort` dependency (§4). Both contexts depend on it.
- The two contexts are structurally similar (both tenant-scoped, both use the same guard shape: resolve tenant → authenticate → validate `aud`), but remain **separate modules** with separate tables, entities, and controllers — not one flow with a role flag, since they're still two distinct principals with distinct token audiences.

---

## 9. Suggested build order

1. `auth-core`: argon2 hashing + JWT sign/verify + refresh rotation + signed `state` helper + `NotificationsPort` (log adapter).
2. TypeORM entities + migrations + **RLS policies** (raw SQL in a migration) for `customers`, `customer_identities`, `customer_refresh_tokens`.
3. Customer email/password: register (with email verification) → login → refresh → logout. Prove RLS with a concurrent-tenant integration test.
4. Customer Google OAuth: central callback + signed `state` round-trip + verified-email linking rule.
5. TypeORM entities + migration + **RLS policies** for `merchant_user_identities` + `merchant_user_refresh_tokens` (alongside the existing `merchant_users` table); merchant admin email/password: register → login → refresh → logout, authz via `merchant_users.role` + `RolesGuard`.
6. Merchant admin Google OAuth (reuse the central callback; `aud: "merchant_admin"`, tenant-scoped `state` per §5).

---

## 10. Known gaps (not designed in this pass)

- **Rate limiting / brute-force protection** on login, password-reset-request, and refresh endpoints is not designed here. Flagged as a follow-up before production launch — do not treat its absence as a decision that it's unnecessary.
- **Test strategy** (unit/integration coverage per endpoint, the RLS proof for both `customers` and `merchant_users` auth tables) is left to the implementation plan rather than spelled out here.

---

## Non-negotiable checklist

- [ ] Two separate identity systems (customer vs merchant admin), both tenant-scoped, distinct tables/entities/token audiences.
- [ ] Credentials in their own table (`customer_identities`, `merchant_user_identities`); `password_hash` never on the principal row.
- [ ] argon2id hashing; no plaintext passwords anywhere.
- [ ] RLS policies on all customer AND merchant-admin auth tables; app role is non-owner/non-superuser.
- [ ] Single registered Google redirect URI + signed `state` carrying `{ population, tenant_id, returnUrl }` for the round-trip.
- [ ] OAuth auto-link ONLY when `email_verified = true`.
- [ ] Opaque, hashed refresh tokens with rotation + reuse detection.
- [ ] `aud` validated on every route; customer/merchant-admin tokens not interchangeable.
- [ ] Authz is app-level via `merchant_users.role`; RLS is not used for permissions.
- [ ] Auth code depends on `NotificationsPort`, never a vendor email SDK directly.
- [ ] Refresh token transported via httpOnly/Secure/SameSite=Lax cookie; access token in memory only.
- [ ] `platform_admins` auth is explicitly out of scope for this spec.
