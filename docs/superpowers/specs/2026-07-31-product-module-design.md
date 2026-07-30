# Product & Category Module Design Spec

**Date:** 2026-07-31  
**Status:** Approved  
**Scope:** Merchant Admin Product/Category Management & Public Storefront Catalog APIs

---

## 1. Overview

The **Product Module** (`apps/api/src/products/`) provides full lifecycle catalog management for the Tiny Threads multi-tenant e-commerce platform. It empowers **Merchant Admins** to create and manage products, variants, inventory, and category hierarchies, while serving **Storefront Customers** with tenant-isolated, high-performance public catalog search, category tree traversal, and product details.

---

## 2. Architecture & Directory Structure

All product and category logic is encapsulated within a unified NestJS `ProductsModule` located at `apps/api/src/products/`.

```
apps/api/src/products/
├── dto/
│   ├── create-product.dto.ts
│   ├── update-product.dto.ts
│   ├── product-query.dto.ts
│   ├── product-response.dto.ts
│   ├── create-category.dto.ts
│   ├── update-category.dto.ts
│   └── category-response.dto.ts
├── merchant-products.controller.ts     # /api/v1/merchant-admins/products
├── merchant-categories.controller.ts   # /api/v1/merchant-admins/categories
├── storefront-products.controller.ts   # /api/v1/products
├── storefront-categories.controller.ts # /api/v1/categories
├── products.service.ts                 # Product & Variant CRUD business logic
├── categories.service.ts               # Hierarchical Category CRUD business logic
├── products.module.ts                  # NestJS Module definition
└── __tests__/                          # Unit tests for services & controllers
```

---

## 3. Endpoints & API Map

### 3.1 Merchant Admin Product Management
**Base Path:** `/api/v1/merchant-admins/products`  
**Authentication:** Required (`MerchantAdminJwtAuthGuard`)  
**Tenant Context:** Extracted from request hostname / CLS context

- `POST /` — Create a new product. Accepts title, status (`draft` | `active` | `archived`), variants array, and category IDs. Auto-generates a default variant if `variants` is empty.
- `GET /` — List products for merchant admin. Supports query params: `page`, `limit`, `status`, `search`.
- `GET /:id` — Get full product details including variants and category assignments.
- `PATCH /:id` — Update product fields, synchronize variants, and update category junction associations.
- `DELETE /:id` — Archive product (`status = 'archived'`).

### 3.2 Merchant Admin Category Management
**Base Path:** `/api/v1/merchant-admins/categories`  
**Authentication:** Required (`MerchantAdminJwtAuthGuard`)  

- `POST /` — Create a category (`name`, optional `parentId`).
- `GET /` — List all categories for tenant formatted as a tree or flat list.
- `GET /:id` — Get category detail.
- `PATCH /:id` — Update category (`name`, `parentId`).
- `DELETE /:id` — Delete category. Fails if category has active sub-categories unless cascade is handled.

### 3.3 Public Storefront Catalog
**Base Path:** `/api/v1/products`  
**Authentication:** Public / Unauthenticated (Tenant resolved via hostname)

- `GET /` — List active products (`status = 'active'`). Supports `page`, `limit`, `categoryId`, `search`. Returns minimal variant summary.
- `GET /:id` — Get active product detail with available variants and category breadcrumbs. Throws `404` if product is `draft` or `archived`.

### 3.4 Public Storefront Categories
**Base Path:** `/api/v1/categories`  
**Authentication:** Public / Unauthenticated

- `GET /` — Get active category hierarchy tree for storefront navigation.
- `GET /:id` — Get category details by ID.

---

## 4. Data Layer & Tenancy Isolation

### 4.1 Entities & Relational Schema
The module uses the existing TypeORM entities in `apps/api/src/db/entities/`:
- `Product`: Primary key `id` (UUIDv7), `tenantId`, `title`, `status` (`'draft' | 'active' | 'archived'`).
- `ProductVariant`: `id`, `tenantId`, `productId`, `sku`, `priceCents`, `stock`, `isDefault`. Indexed by `(tenant_id, product_id)` and composite unique on `(tenant_id, sku)`.
- `Category`: `id`, `tenantId`, `name`, `parentId` (composite self-FK to parent within same tenant).
- `ProductCategory`: Junction table with composite primary key `(tenant_id, product_id, category_id)`.

### 4.2 RLS & Transaction Rules
1. **RLS Context**: All database operations execute inside `TenantDbService.run(async (em) => { ... })` to enforce Postgres Row-Level Security (`set_config('app.current_tenant', ...)`).
2. **Product Creation Transaction**:
   - Validate category IDs exist within tenant context.
   - Insert `Product`.
   - Insert `ProductVariant` items. If no variants provided, auto-create default variant (`isDefault: true`, `sku: generateSku(product)`, `priceCents: 0`, `stock: 0`).
   - Insert junction rows in `product_categories`.
3. **Product Update Transaction**:
   - Update scalar product fields.
   - Sync variants (upsert updated/new, remove deleted variants). Ensure exactly one variant has `isDefault: true`.
   - Sync `product_categories` junction table.

---

## 5. Validation & Error Handling

All errors throw platform `Coded*Exception` instances mapping to `@tiny-threads/shared` `ErrorCode`:

| Scenario | HTTP Status | Error Code | Exception |
| :--- | :--- | :--- | :--- |
| Product/Category not found or inactive on storefront | `404 Not Found` | `ErrorCode.RESOURCE_NOT_FOUND` | `CodedNotFoundException` |
| Invalid DTO inputs, negative prices/stock, or cyclic category hierarchy | `400 Bad Request` | `ErrorCode.VALIDATION_FAILED` | `CodedBadRequestException` |
| Duplicate SKU within same tenant | `409 Conflict` | `ErrorCode.DUPLICATE_RESOURCE` | `CodedConflictException` |
| Unauthenticated access to admin endpoints | `401 Unauthorized` | `ErrorCode.UNAUTHORIZED` | `CodedUnauthorizedException` |

---

## 6. Testing & Verification

1. **Unit Tests (`apps/api/src/products/__tests__/`)**:
   - Service unit tests for default variant generation, variant sync, status filtering, category tree construction, self-parent and cycle prevention.
2. **E2E Tests (`apps/api/test/`)**:
   - `merchant-products.e2e-spec.ts`: Verify admin CRUD, auth guards, tenant isolation.
   - `storefront-products.e2e-spec.ts`: Verify public storefront endpoints, filtering inactive products, and hostname tenant resolution.
3. **Verification Commands**:
   - `pnpm --filter @tiny-threads/api test`
   - `pnpm --filter @tiny-threads/api db:verify-rls`
   - `pnpm build`
   - `pnpm lint`
