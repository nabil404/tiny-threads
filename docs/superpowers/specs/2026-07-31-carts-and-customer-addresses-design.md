# Design Document: Carts & Customer Address Management

**Date:** 2026-07-31  
**Status:** Approved  
**Scope:** Backend Commerce Pipeline Sub-project 1 (`apps/api`)  

---

## 1. Overview & Business Objectives

This document specifies the design for **Sub-project 1** of the Tiny Threads commerce pipeline backend:
1. **Server-Side Persistent Carts (`carts`, `cart_items`)**: Multi-tenant server-persisted carts supporting both guest sessions and authenticated customer accounts, complete with item quantity management, server-calculated totals, and login cart merging.
2. **Customer Address Management (`customer_addresses`)**: Full e-commerce customer shipping and billing address CRUD with default address handling per tenant.

---

## 2. Tenancy & Database Schema

All database operations run through `TenantDbService.run(...)` with PostgreSQL Row-Level Security (RLS) enabled on tenant tables.

### 2.1 Entity Schema Updates

#### `Cart` (`apps/api/src/db/entities/carts.entity.ts`)
- `id`: `uuid` (v7, PK with `tenant_id`)
- `tenantId`: `uuid`
- `customerId`: `uuid | null` (Nullable for guest carts)
- `sessionId`: `string | null` (Nullable for authenticated customer carts)
- `status`: `'active' | 'abandoned' | 'converted'`
- **Indexes & Constraints**:
  - Index: `(tenantId, customerId)`
  - Index: `(tenantId, sessionId)`
  - Partial Unique Index: `(tenantId, customerId)` WHERE `status = 'active'`
  - Partial Unique Index: `(tenantId, sessionId)` WHERE `status = 'active'`

#### `CartItem` (`apps/api/src/db/entities/cart-items.entity.ts`)
- `id`: `uuid` (v7, PK with `tenant_id`)
- `tenantId`: `uuid`
- `cartId`: `uuid`
- `variantId`: `uuid` (FK to `ProductVariant`)
- `qty`: `integer` (>= 1)
- **Constraints**:
  - Unique: `(tenantId, cartId, variantId)`

#### `CustomerAddress` (`apps/api/src/db/entities/customer-addresses.entity.ts`)
- `id`: `uuid` (v7, PK with `tenant_id`)
- `tenantId`: `uuid`
- `customerId`: `uuid`
- `firstName`: `string`
- `lastName`: `string`
- `company`: `string | null`
- `line1`: `string`
- `line2`: `string | null`
- `city`: `string`
- `stateProvince`: `string | null`
- `postalCode`: `string`
- `countryCode`: `string` (FK to `countries.code`)
- `phone`: `string | null`
- `isDefaultShipping`: `boolean` (default `false`)
- `isDefaultBilling`: `boolean` (default `false`)

---

## 3. Architecture & API Specifications

### 3.1 Carts Module (`apps/api/src/carts/`)

#### Identity & Guest Session Resolution
- Endpoints check `req.user` (authenticated customer JWT).
- If unauthenticated, endpoints check `X-Guest-Session-ID` HTTP header (UUID).
- If neither is provided on `GET /api/v1/cart`, a new guest `sessionId` is generated and returned in the `X-Guest-Session-ID` response header.

#### API Endpoints
- `GET /api/v1/cart` — Fetch or create current active cart with line totals & subtotal.
- `POST /api/v1/cart/items` — Add item `{ variantId: string, qty: number }`. Upserts if variant already exists.
- `PATCH /api/v1/cart/items/:id` — Update quantity `{ qty: number }`. If `qty <= 0`, removes item.
- `DELETE /api/v1/cart/items/:id` — Remove cart item.
- `POST /api/v1/cart/merge` — Merge guest cart `{ guestSessionId: string }` into customer cart upon login (sums quantities on duplicate variants; marks guest cart `abandoned`).

### 3.2 Customer Addresses Module (`apps/api/src/customer-addresses/`)

#### Auth & Business Rules
- Protected by `CustomerJwtAuthGuard`.
- Setting `isDefaultShipping = true` unsets `isDefaultShipping` on all other addresses for the customer within the tenant.
- Setting `isDefaultBilling = true` unsets `isDefaultBilling` on all other addresses for the customer within the tenant.

#### API Endpoints
- `GET /api/v1/customers/me/addresses` — List saved customer addresses.
- `GET /api/v1/customers/me/addresses/:id` — Fetch address by ID.
- `POST /api/v1/customers/me/addresses` — Create address. Validates `countryCode`.
- `PATCH /api/v1/customers/me/addresses/:id` — Update address fields.
- `DELETE /api/v1/customers/me/addresses/:id` — Delete address.
- `POST /api/v1/customers/me/addresses/:id/default` — Set default status `{ defaultShipping?: boolean, defaultBilling?: boolean }`.

---

## 4. Error Handling & Shared Error Codes

Add the following error codes to `packages/shared/src/errors/error-code.enum.ts`:
- `CART_NOT_FOUND`
- `CART_ITEM_NOT_FOUND`
- `INVALID_CART_QUANTITY`
- `PRODUCT_VARIANT_NOT_FOUND`
- `ADDRESS_NOT_FOUND`
- `INVALID_COUNTRY_CODE`

Exceptions are thrown using coded exceptions (`CodedNotFoundException`, `CodedBadRequestException`).

---

## 5. Testing & Verification

1. **Unit Tests**:
   - Cart quantity calculations, subtotal summation, and cart merge logic.
   - Address CRUD and transactional default flag updates.
2. **E2E & RLS Tests**:
   - Guest cart flow via `X-Guest-Session-ID` header.
   - Authenticated customer cart flow & guest cart merge.
   - Strict RLS isolation verification ensuring Tenant A cannot read/modify Tenant B cart or address resources.
