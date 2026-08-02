# Single Product Variant Endpoints — Design Specification

**Date**: 2026-08-03  
**Status**: Approved  
**Module**: `apps/api/src/products`

---

## 1. Overview

This feature introduces granular REST API endpoints for managing individual product variants under the path `/api/v1/merchant-admins/products/:productId/variants`. 

Currently, variants can only be updated in bulk via `PATCH /api/v1/merchant-admins/products/:id`. Single-variant endpoints allow merchants to create, read, update (e.g. stock level, price, SKU), and delete individual variants independently without resending the entire variant list or modifying product metadata.

---

## 2. API Endpoints Specification

Controller: `MerchantProductVariantsController`  
Base Path: `/api/v1/merchant-admins/products/:productId/variants`  
Authentication: `MerchantAdminJwtAuthGuard`

| Method | Path | Roles | Description | Response Code |
|---|---|---|---|---|
| `POST` | `/` | `owner`, `admin` | Create a new variant for product | `201 Created` |
| `GET` | `/` | `owner`, `admin`, `staff` | List all variants for product | `200 OK` |
| `GET` | `/:variantId` | `owner`, `admin`, `staff` | Get single variant by ID | `200 OK` |
| `PATCH` | `/:variantId` | `owner`, `admin` | Update single variant fields | `200 OK` |
| `DELETE` | `/:variantId` | `owner`, `admin` | Delete single variant | `204 No Content` |

### DTO Specifications

- **`CreateProductVariantDto`**:
  - `sku`: string (required)
  - `priceCents`: number (required, non-negative integer)
  - `stock`: number (required, non-negative integer)
  - `isDefault`: boolean (optional, default `false`)

- **`UpdateProductVariantDto`**:
  - `sku`: string (optional)
  - `priceCents`: number (optional, non-negative integer)
  - `stock`: number (optional, non-negative integer)
  - `isDefault`: boolean (optional)

---

## 3. Invariants & Business Logic

All single-variant operations execute within `TenantDbService.run(...)` to guarantee PostgreSQL Row-Level Security (RLS) tenant isolation.

### 1. Minimum Variant Count
- Every product MUST maintain at least 1 variant.
- Attempting to delete the last variant via `DELETE /:variantId` throws a `CodedBadRequestException(ErrorCode.VALIDATION_FAILED, 'Cannot delete the only variant of a product')`.

### 2. Default Variant Auto-Swap & Auto-Promotion
- Exactly 1 variant per product must have `isDefault = true`.
- **On Create / Update with `isDefault: true`**:
  - If a variant is created or updated with `isDefault = true`, all other variants for `:productId` in the same tenant are automatically set to `isDefault = false` within the transaction.
- **On Delete of Default Variant**:
  - If the variant being deleted is `isDefault = true` (and other variants remain), the service automatically selects the oldest remaining variant (sorted by `createdAt ASC`) and sets its `isDefault = true` within the transaction.

### 3. SKU Uniqueness
- SKUs are unique per tenant.
- Attempting to set a SKU already used by another variant in the tenant throws `CodedConflictException(ErrorCode.DUPLICATE_RESOURCE)`.

### 4. Product Ownership & Tenant Scope Verification
- Queries verify both `productId` and `variantId` belong to the active tenant.
- If `:variantId` does not belong to `:productId`, the service throws `CodedNotFoundException(ErrorCode.RESOURCE_NOT_FOUND)`.

---

## 4. Architecture & Module Structure

```
apps/api/src/products/
├── controllers/
│   ├── merchant-products.controller.ts
│   ├── merchant-product-variants.controller.ts  <-- NEW
│   ├── merchant-categories.controller.ts
│   ├── storefront-products.controller.ts
│   └── storefront-categories.controller.ts
├── dto/
│   ├── create-product-variant.dto.ts            <-- NEW
│   ├── update-product-variant.dto.ts            <-- NEW
│   └── ...
├── services/
│   ├── products.service.ts                      <-- Extended with single-variant methods
│   └── categories.service.ts
└── products.module.ts                           <-- Controller registered
```

---

## 5. Testing & Documentation Plan

1. **Unit & Integration Tests**:
   - `MerchantProductVariantsController` & `ProductsService` variant methods tested in `apps/api/src/products/__tests__/`.
   - Test default auto-swap on create/update.
   - Test auto-promotion of next variant when deleting default variant.
   - Test validation error when attempting to delete sole variant.
   - Test multi-tenant isolation and product ownership mismatches.

2. **Documentation**:
   - Update `docs/architecture/products-and-categories.md` as-built reference with single-variant endpoints and rules.
