# Design Specification: Image Upload for User Profiles and Product Variants (Backend Only)

**Date:** 2026-08-12  
**Status:** Approved  
**Scope:** Backend (`apps/api`, `packages/shared`)

---

## 1. Overview & Goals

This specification introduces image upload and asset management capabilities to Tiny Threads:
1. **Storage Domain Port (`apps/api/src/storage/`)**: A provider-agnostic interface (`StoragePort`) with interchangeable adapters for local disk filesystem (dev/test) and S3-compatible cloud object storage (AWS S3, MinIO, Cloudflare R2).
2. **Server-Side Image Processing (`sharp`)**: Image validation (magic bytes & MIME checking), EXIF metadata stripping (for security and privacy), resizing, and automatic WebP compression.
3. **User Profile Avatars**: Profile photo upload and deletion for both Merchant Admin users (`merchant_users.avatar_url`) and Storefront Customers (`customers.avatar_url`).
4. **Product Variant Images**: Multi-image gallery support for product variants with ordering (`sort_order`), primary image flag (`is_primary`), and full transactional CRUD + batch reordering capabilities (`product_variant_images` table).
5. **Multi-Tenancy & RLS**: All storage keys are strictly tenant-namespaced (`tenants/{tenantId}/...`) and all database tables enforce PostgreSQL Row-Level Security (`ENABLE` + `FORCE`) with composite primary keys `(tenant_id, id)` and composite foreign keys `(tenant_id, variant_id)`.

### Non-Goals (Scope Delimitation)
- **No Frontend UI**: As requested, scope is strictly backend (`apps/api` and `@tiny-threads/shared`). Admin web UI integration will be handled in a separate follow-up task.
- **No Video/Non-Image Uploads**: Scope is restricted to raster image formats (`image/jpeg`, `image/png`, `image/webp`, `image/avif`).

---

## 2. Storage Subsystem Architecture (`apps/api/src/storage/`)

### 2.1 Storage Domain Port (`storage.port.ts`)

```typescript
export interface UploadFileOptions {
  key: string;
  buffer: Buffer;
  contentType: string;
  tenantId: string;
}

export interface StoragePort {
  upload(options: UploadFileOptions): Promise<{ key: string; url: string }>;
  delete(key: string): Promise<void>;
  getUrl(key: string): string;
}

export const STORAGE_PORT = Symbol('STORAGE_PORT');
```

### 2.2 Adapters

1. **`LocalStorageAdapter` (`local-storage.adapter.ts`)**:
   - Stores files in `STORAGE_LOCAL_ROOT` (defaults to `./uploads` under `apps/api/uploads`).
   - Tenant isolation: directories structured as `uploads/tenants/{tenantId}/{category}/{filename}`.
   - Deletes files cleanly and ignores `ENOENT` on missing files.
   - Generates URLs based on `STORAGE_PUBLIC_URL_BASE` or `http://localhost:3000/uploads/...`.
   - Mounts an Express static handler in `main.ts` / `bootstrap.ts` to serve `/uploads` when `STORAGE_DRIVER === 'local'`.
2. **`S3StorageAdapter` (`s3-storage.adapter.ts`)**:
   - Uses `@aws-sdk/client-s3` (`PutObjectCommand`, `DeleteObjectCommand`).
   - Configured with `AWS_REGION`, `AWS_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT` (for MinIO/R2), and `STORAGE_PUBLIC_URL_BASE`.

### 2.3 Image Processing Service (`image-processing.service.ts`)

- Utilizes `sharp`:
  - **MIME & Magic Bytes Inspection**: Verifies image buffer headers against allowed formats (`JPEG`, `PNG`, `WebP`, `AVIF`). Rejects unrecognized binary streams.
  - **Avatar Normalization**: Resizes to square `512x512` (cover), strips EXIF, encodes as WebP at quality 85.
  - **Variant Image Normalization**: Bounds to max `2048x2048` (preserving aspect ratio with `fit: 'inside'`), strips EXIF, encodes as WebP at quality 85.
- Returns `{ buffer: Buffer, contentType: 'image/webp', sizeBytes: number }`.

### 2.4 Storage Configuration (`apps/api/src/config/storage.config.ts`)

Registered with NestJS `ConfigModule`:
- `STORAGE_DRIVER`: `'local'` | `'s3'` (default `'local'`)
- `STORAGE_LOCAL_ROOT`: `string` (default `./uploads`)
- `STORAGE_PUBLIC_URL_BASE`: `string` (default `http://localhost:3000/uploads`)
- `AWS_REGION`: `string` (optional, default `us-east-1`)
- `AWS_BUCKET`: `string` (optional)
- `AWS_ACCESS_KEY_ID`: `string` (optional)
- `AWS_SECRET_ACCESS_KEY`: `string` (optional)
- `AWS_ENDPOINT`: `string` (optional, for MinIO/S3-compatible providers)

---

## 3. Database Schema, Entities & Migrations

### 3.1 Migration: `AddAvatarToUsersAndCreateVariantImages`

```sql
-- 1. Add avatar_url to merchant_users
ALTER TABLE merchant_users
  ADD COLUMN avatar_url text NULL;

-- 2. Add avatar_url to customers
ALTER TABLE customers
  ADD COLUMN avatar_url text NULL;

-- 3. Create product_variant_images table
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

CREATE INDEX product_variant_images_tenant_variant_idx
  ON product_variant_images (tenant_id, variant_id, sort_order ASC);
```

- Enables RLS on `product_variant_images`:
  ```ts
  await enableRls(queryRunner, 'product_variant_images');
  ```

### 3.2 TypeORM Entities

1. **`ProductVariantImage` (`apps/api/src/db/entities/product-variant-images.entity.ts`)**:
   - Extends `TenantEntityBase`.
   - `@ManyToOne(() => ProductVariant, (variant) => variant.images)` with composite join columns `[{ name: 'tenant_id', referencedColumnName: 'tenantId' }, { name: 'variant_id', referencedColumnName: 'id' }]`.
2. **`ProductVariant` Entity (`apps/api/src/db/entities/product-variants.entity.ts`)**:
   - Adds `@OneToMany(() => ProductVariantImage, (image) => image.variant) images?: ProductVariantImage[];`
3. **`MerchantUser` Entity (`apps/api/src/db/entities/merchant-users.entity.ts`)**:
   - Adds `@Column({ name: 'avatar_url', type: 'text', nullable: true }) avatarUrl!: string | null;`
4. **`Customer` Entity (`apps/api/src/db/entities/customers.entity.ts`)**:
   - Adds `@Column({ name: 'avatar_url', type: 'text', nullable: true }) avatarUrl!: string | null;`

---

## 4. REST API Endpoints & Request/Response Contracts

### 4.1 Merchant Admin Profile Avatar

- **`POST /merchant-admins/me/avatar`**
  - **Auth**: `MerchantAdminJwtAuthGuard`
  - **Body**: `multipart/form-data` with file field `avatar` (max 5MB, JPEG/PNG/WebP/AVIF).
  - **Logic**: Reads current user from CLS tenant context, optimizes avatar, uploads to `tenants/{tenantId}/avatars/merchant-users/{userId}.webp`, deletes old file if present, updates `merchant_users.avatar_url`.
  - **Response `200 OK`**:
    ```json
    {
      "avatarUrl": "http://localhost:3000/uploads/tenants/01918.../avatars/merchant-users/01918...webp"
    }
    ```

- **`DELETE /merchant-admins/me/avatar`**
  - **Auth**: `MerchantAdminJwtAuthGuard`
  - **Logic**: Sets `merchant_users.avatar_url = NULL` and deletes asset from storage.
  - **Response `204 No Content`**.

- **Updated `GET /merchant-admins/auth/me`**:
  - Includes `avatarUrl: string | null` in `user` object.

### 4.2 Customer Profile Avatar

- **`POST /customers/me/avatar`**
  - **Auth**: `CustomerJwtAuthGuard`
  - **Body**: `multipart/form-data` with file field `avatar` (max 5MB).
  - **Logic**: Optimizes avatar, uploads to `tenants/{tenantId}/avatars/customers/{customerId}.webp`, updates `customers.avatar_url`.
  - **Response `200 OK`**: `{ "avatarUrl": "..." }`

- **`DELETE /customers/me/avatar`**
  - **Auth**: `CustomerJwtAuthGuard`
  - **Response `204 No Content`**.

- **Updated `GET /customers/me`**:
  - Includes `avatarUrl: string | null`.

### 4.3 Product Variant Images Management

- **`POST /merchant-admins/products/:productId/variants/:variantId/images`**
  - **Auth**: `MerchantAdminJwtAuthGuard, RolesGuard` (`owner`, `admin`)
  - **Body**: `multipart/form-data` with:
    - `image`: File (max 10MB)
    - `altText`?: string (optional)
    - `isPrimary`?: boolean (optional, default `false`)
  - **Logic**:
    - Verifies product and variant belong to current tenant.
    - Optimizes image with Sharp (max 2048px WebP).
    - Checks existing variant images count to determine `sortOrder` (appends to end).
    - If `isPrimary = true` or if no other images exist for the variant, sets `isPrimary = true` and updates any existing primary images to `isPrimary = false`.
    - Saves `ProductVariantImage` record and writes file to `tenants/{tenantId}/products/{variantId}/{imageId}.webp`.
  - **Response `201 Created`**:
    ```json
    {
      "id": "01918a5b-7b70-7c2a-92ea-3df95a5f1111",
      "variantId": "01918a58-89c0-7815-9988-1234567890ab",
      "url": "http://localhost:3000/uploads/tenants/.../products/...webp",
      "altText": "Front view of shirt",
      "sortOrder": 0,
      "isPrimary": true,
      "createdAt": "2026-08-12T11:50:00.000Z",
      "updatedAt": "2026-08-12T11:50:00.000Z"
    }
    ```

- **`GET /merchant-admins/products/:productId/variants/:variantId/images`**
  - **Auth**: `MerchantAdminJwtAuthGuard`
  - **Response `200 OK`**: Array of `ProductVariantImage` DTOs ordered by `sortOrder ASC, createdAt ASC`.

- **`PATCH /merchant-admins/products/:productId/variants/:variantId/images/:imageId`**
  - **Auth**: `MerchantAdminJwtAuthGuard, RolesGuard` (`owner`, `admin`)
  - **Body**:
    ```json
    {
      "altText": "Updated alt text",
      "isPrimary": true,
      "sortOrder": 1
    }
    ```
  - **Logic**:
    - If `isPrimary` is updated to `true`, demotes any existing primary image for that variant.
  - **Response `200 OK`**: Updated image record.

- **`DELETE /merchant-admins/products/:productId/variants/:variantId/images/:imageId`**
  - **Auth**: `MerchantAdminJwtAuthGuard, RolesGuard` (`owner`, `admin`)
  - **Logic**:
    - Deletes image record and deletes storage file.
    - If deleted image was `isPrimary`, automatically promotes the next available image in `sortOrder` to `isPrimary = true`.
  - **Response `204 No Content`**.

- **`PUT /merchant-admins/products/:productId/variants/:variantId/images/reorder`**
  - **Auth**: `MerchantAdminJwtAuthGuard, RolesGuard` (`owner`, `admin`)
  - **Body**:
    ```json
    {
      "imageIds": ["uuid-1", "uuid-2", "uuid-3"]
    }
    ```
  - **Logic**: In a database transaction, verifies all IDs belong to the specified variant and sets `sortOrder = index`.
  - **Response `200 OK`**: Array of reordered image records.

### 4.4 Storefront Products Query Serialization

- `GET /storefront/products` and `GET /storefront/products/:id` queries:
  - Relations updated to load `variants.images` with ordering by `sortOrder ASC`.
  - Storefront product/variant responses include the list of image URLs and `isPrimary` marker.

---

## 5. Error Handling & Shared Constants

### 5.1 Shared Error Codes (`packages/shared/src/errors/error-codes.ts`)

Add the following error codes:
```typescript
INVALID_FILE_TYPE = 'INVALID_FILE_TYPE',
FILE_TOO_LARGE = 'FILE_TOO_LARGE',
IMAGE_PROCESSING_FAILED = 'IMAGE_PROCESSING_FAILED',
PRODUCT_VARIANT_IMAGE_NOT_FOUND = 'PRODUCT_VARIANT_IMAGE_NOT_FOUND',
```

### 5.2 Coded Exceptions
- Throws `CodedBadRequestException(ErrorCode.INVALID_FILE_TYPE, '...')`
- Throws `CodedBadRequestException(ErrorCode.FILE_TOO_LARGE, '...')`
- Throws `CodedUnprocessableEntityException(ErrorCode.IMAGE_PROCESSING_FAILED, '...')`
- Throws `CodedNotFoundException(ErrorCode.PRODUCT_VARIANT_IMAGE_NOT_FOUND, '...')`

---

## 6. Testing Strategy

1. **Unit Tests**:
   - `LocalStorageAdapter`: file write, directory creation, deletion, URL generation.
   - `S3StorageAdapter`: command dispatching with mocked AWS SDK S3 client.
   - `ImageProcessingService`: sharp transformations, aspect-ratio preservation, metadata stripping, invalid file signatures.
   - `MerchantAdminsAvatarService` & `CustomerAvatarService`: avatar updates, deletion, error handling.
   - `ProductVariantImagesService`: image upload, primary toggle, auto-promotion of primary on delete, atomic reorder.
2. **Integration / E2E Tests**:
   - Multipart file upload via supertest (`.attach('image', ...)`).
   - RLS multi-tenant boundary test: verifying Tenant A cannot read/mutate images of Tenant B.
   - Verification of `verify-rls` on the new `product_variant_images` table.
