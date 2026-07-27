# Authentication & Authorization Design

Spec for implementing email/password + Google OAuth in this platform. Written to be self-contained — read the **Project context** first, then implement against the rules below. Security-critical items are marked **MUST** / **MUST NOT**; treat those as non-negotiable.

---

## Project context (constraints you must respect)

- **Stack:** NestJS · PostgreSQL · TypeScript · TypeORM. Structured as a **modular monolith** organized by bounded context (Catalog, Inventory, Cart/Checkout, Orders, Payments, Customers, Pricing, Shipping, Tax).
- **Tenancy:** multi-tenant e-commerce **marketplace** (dozens of merchants selling to their own customers). **Pooled model** — shared schema with a `tenant_id` discriminator on every tenant-scoped table.
- **Isolation backstop:** PostgreSQL **Row-Level Security (RLS)** is the load-bearing isolation mechanism. The app runtime DB role is a **non-owner, non-superuser** role, and tables use `FORCE ROW LEVEL SECURITY`. Tenant context is set per-transaction via `SET LOCAL app.current_tenant = ...`.
- **Tenant resolution:** resolved early from subdomain (`shop.platform.com`), merchant **custom domain**, or a JWT claim/header for admin & API traffic. Carried through `AsyncLocalStorage` (via `nestjs-cls`).
- **Keys & uniqueness:** primary keys are **UUID v7**. All uniqueness is **composite with `tenant_id`** for tenant-scoped tables (never global).

---

## 0. The core fork — there are TWO auth populations

Do not build one `users` table. The architecture already separates two populations with different identity semantics:

| | Storefront customers | Staff / merchant admins |
|---|---|---|
| Identity scope | **Tenant-scoped** — same email is two separate accounts under two merchants | **Platform-global** — one person, one login |
| Tenant link | `tenant_id` on the row | **Many-to-many** with tenants, a role per membership |
| Table location | Tenant-scoped tables, under RLS | `public` schema, not tenant-scoped |
| Guard ordering | Resolve tenant from domain **first**, then authenticate within it | Authenticate principal **first**, then resolve active tenant from token claim/header |
| Token audience | `aud: "customer"`, carries `tenant_id` | `aud: "staff"`, carries active-tenant claim |

You are effectively building two flows that share primitives (hashing, OAuth strategy, token utils), not one flow with a role flag.

---

## 1. Build vs. buy

- **Customers → roll your own** with Passport (`@nestjs/passport`, `passport-local`, `passport-google-oauth20`, `@nestjs/jwt`). Managed IdPs price per monthly-active-user, which here means *every merchant's entire customer base* — expensive, and per-tenant customer pools are awkward in tools that assume a single global pool.
- **Staff → either** the same Passport stack **or** a managed IdP with first-class **Organizations** (WorkOS / Auth0 Organizations / Clerk), which map cleanly to the many-to-many. If you want a single system to maintain, use Passport here too.

This spec assumes the **Passport-based** path for both.

---

## 2. Data model

Model credentials as their **own table**, separate from the principal. This is what makes "email/password AND Google on the same account" clean, and keeps `password_hash` off the principal row.

### Customer side (tenant-scoped, under RLS)

```
customer
  id                uuid pk (v7)
  tenant_id         uuid not null
  email             citext not null
  ...
  UNIQUE (tenant_id, email)

customer_identity
  id                uuid pk (v7)
  tenant_id         uuid not null
  customer_id       uuid not null -> customer.id
  provider          text not null            -- 'password' | 'google'
  provider_subject  text                     -- Google `sub`; NULL for password
  password_hash     text                     -- argon2id; NULL for google
  email_verified    boolean not null default false
  created_at        timestamptz
  UNIQUE (tenant_id, provider, provider_subject)   -- for oauth rows
  UNIQUE (tenant_id, customer_id, provider)         -- one password row per customer

customer_refresh_token
  id                uuid pk (v7)
  tenant_id         uuid not null
  customer_id       uuid not null -> customer.id
  token_hash        text not null            -- store HASH, never the token
  family_id         uuid not null            -- for rotation / reuse detection
  expires_at        timestamptz not null
  revoked_at        timestamptz
```

### Staff side (`public`, platform-global — NOT tenant-scoped)

```
staff_user
  id                uuid pk (v7)
  email             citext not null
  ...
  UNIQUE (email)                              -- global, because staff are platform-wide

staff_identity
  id                uuid pk (v7)
  staff_user_id     uuid not null -> staff_user.id
  provider          text not null            -- 'password' | 'google'
  provider_subject  text
  password_hash     text
  email_verified    boolean not null default false
  UNIQUE (provider, provider_subject)
  UNIQUE (staff_user_id, provider)

tenant_membership
  id                uuid pk (v7)
  staff_user_id     uuid not null -> staff_user.id
  tenant_id         uuid not null
  role              text not null            -- e.g. 'owner' | 'admin' | 'staff' | 'viewer'
  UNIQUE (staff_user_id, tenant_id)

staff_refresh_token                           -- same shape as customer_refresh_token, no tenant_id
```

- **MUST** apply RLS policies to `customer` / `customer_identity` / `customer_refresh_token` exactly like every other tenant-scoped table.
- **MUST NOT** put a `tenant_id` on `staff_user`; the tenant relationship is `tenant_membership`.
- Use **TypeORM entities** as the source of truth; composite indexes lead with `tenant_id` for the customer tables (declare via `@Index(['tenantId', ...])`). Prefer explicit TypeORM **migrations** over `synchronize: true` — you need hand-written SQL for the RLS policies anyway.
- **RLS + TypeORM caveat:** the per-transaction `SET LOCAL app.current_tenant = ...` **MUST** run on the same connection as the query. Centralize it in a transaction wrapper that uses a `QueryRunner` (run `SET LOCAL` then the work inside one `queryRunner.startTransaction()`), or an `EntitySubscriberInterface`/custom repository that reads `tenant_id` from `nestjs-cls`. Feature code **MUST NOT** issue `SET LOCAL` itself, and **MUST NOT** rely on `SET` (session-scoped) — it bleeds across pooled connections.

---

## 3. Password handling

- **MUST** hash with **argon2id** (`argon2` package). bcrypt is an acceptable fallback but argon2id is preferred.
- **MUST NOT** log, return, or store plaintext passwords anywhere, including error messages.
- Enforce a sane minimum length (≥12) and check against a breached-password list if feasible; do not impose composition rules that push users toward weak patterns.
- Password reset: single-use, short-TTL token stored **hashed**, delivered by email; invalidate all refresh tokens on reset.
- Email verification: required before a `password` identity is considered `email_verified = true`.

---

## 4. Google OAuth

Use **Authorization Code flow with PKCE**.

### The multi-tenant redirect-URI problem (critical)

Google requires **exact-match** registered redirect URIs. You **cannot** register a wildcard for every merchant subdomain and custom domain.

- **MUST** use a **single centralized callback** on the platform's own domain, e.g. `https://auth.platform.com/oauth/google/callback`, registered once in the Google Cloud console.
- **MUST** carry the originating tenant + post-login return URL in a **signed `state` parameter** (sign it; treat `state` as untrusted on the way back). Also use `state` for CSRF protection as usual.
- After token exchange at the central callback, redirect the browser back to the originating tenant domain with a short-lived one-time code, then complete the session there.

### Account linking (account-takeover vector — read carefully)

When a user who already has a `password` identity signs in with Google on the same email:

- **MUST** only auto-link the Google identity to the existing account when Google reports **`email_verified = true`**.
- **MUST NOT** auto-link on matching email when the OAuth email is unverified. Instead, require the user to authenticate with their existing password first, then link deliberately. Skipping this lets anyone who can mint an OAuth token for an unverified email take over the account.
- Store the Google `sub` (`provider_subject`), not the email, as the stable identifier — emails change.

---

## 5. Tokens & sessions

- **Access token:** JWT, short-lived (~15 min). **MUST** include an `aud` claim distinguishing populations:
  - customer tokens → `aud: "customer"`, include `tenant_id`.
  - staff tokens → `aud: "staff"`, include the staff principal id + an **active-tenant** claim (staff choose/switch which tenant they're acting in).
- **Refresh token:** **opaque random** value (not a JWT). **MUST** be stored **hashed** server-side with **rotation + reuse detection**: on each refresh, issue a new token in the same `family_id` and revoke the old one; if a revoked token in a family is presented, revoke the entire family (theft signal).
- **MUST** validate `aud` on every protected route — a customer token must never be accepted on a staff route or vice versa.
- Customer refresh tokens are tenant-scoped and live under RLS.

---

## 6. Authorization (authz)

- **RLS is NOT authorization.** RLS isolates *tenant data*; it says nothing about whether a role may perform an action (e.g. issue a refund). Keep authz **app-level**.
- **MUST NOT** try to encode business permissions in RLS policies.
- Staff permissions come from the **role on the `tenant_membership` row** for the **active** tenant. The chain is: `JwtAuthGuard` (verify token + `aud`) → resolve active tenant → `RolesGuard`/policy guard reads the membership role for that tenant.
- Customers get their own, simpler RBAC (typically just "is this their own resource").

---

## 7. NestJS module layout

- **`Customers` context** owns the customer auth flow (local + Google strategies, customer JWT, customer refresh tokens).
- A separate **`Platform` / `IAM` module** owns staff auth (local + Google strategies, staff JWT, `tenant_membership`, staff RBAC).
- A small shared **`auth-core`** utility module: argon2 hashing, token signing/verification, refresh-token rotation logic, the signed-`state` helper. Both contexts depend on it.
- Guard ordering differs by population (see §0) — do not share a single global guard that assumes one flow.

---

## 8. Suggested build order

1. `auth-core`: argon2 hashing + JWT sign/verify + refresh rotation + signed `state` helper.
2. TypeORM entities + migrations + **RLS policies** (raw SQL in a migration) for the customer tables; `public` tables for staff.
3. Customer email/password: register (with email verification) → login → refresh → logout. Prove RLS with a concurrent-tenant integration test.
4. Customer Google OAuth: central callback + signed `state` round-trip + verified-email linking rule.
5. Staff email/password + `tenant_membership` + `RolesGuard`, with active-tenant switching.
6. Staff Google OAuth (reuse the central callback; different `aud`).

---

## Non-negotiable checklist

- [ ] Two separate identity systems (customer tenant-scoped vs staff platform-global).
- [ ] Credentials in their own table; `password_hash` never on the principal row.
- [ ] argon2id hashing; no plaintext passwords anywhere.
- [ ] RLS policies on all customer auth tables; app role is non-owner/non-superuser.
- [ ] Single registered Google redirect URI + signed `state` for tenant round-trip.
- [ ] OAuth auto-link ONLY when `email_verified = true`.
- [ ] Opaque, hashed refresh tokens with rotation + reuse detection.
- [ ] `aud` validated on every route; customer/staff tokens not interchangeable.
- [ ] Authz is app-level via membership role; RLS is not used for permissions.
