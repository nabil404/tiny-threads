# Image Upload for User Profiles and Product Variants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement backend image upload and management support for Merchant Admin / Customer user profiles and Product Variants with Sharp image optimization, pluggable StoragePort adapters (Local filesystem & S3-compatible), and PostgreSQL RLS multi-tenancy.

**Architecture:** A domain-owned `StoragePort` with `LocalStorageAdapter` and `S3StorageAdapter` provides vendor-agnostic file storage. `ImageProcessingService` strips EXIF metadata, validates magic bytes, and encodes WebP formats. Database tables (`merchant_users`, `customers`, and new `product_variant_images`) store avatar and variant gallery images under strict composite PK/FK constraints and PostgreSQL RLS isolation.

**Tech Stack:** NestJS 11, TypeORM, PostgreSQL 16 (RLS), TypeScript, `@tiny-threads/shared`, `sharp`, `@aws-sdk/client-s3`, `@types/multer`, Jest, Supertest.

## Global Constraints

- **Tenancy Isolation:** Storage keys must be tenant-namespaced (`tenants/${tenantId}/...`). All DB queries on tenant-scoped tables must go through `TenantDbService.run()` / `withTenant()`.
- **Database Keys:** `product_variant_images` has composite PK `(tenant_id, id)` and composite FK `(tenant_id, variant_id)` referencing `product_variants(tenant_id, id) ON DELETE CASCADE`.
- **Image Processing:** Avatar photos resized to max 512×512 WebP; Variant images bounded to max 2048×2048 WebP; EXIF metadata stripped.
- **Error Handling:** Throw `Coded*Exception` with `ErrorCode` from `@tiny-threads/shared`.

---

### Task 1: Dependencies and Shared Error Codes

**Files:**
- Modify: `packages/shared/src/errors/error-codes.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/api/package.json`
- Test: `packages/shared/src/errors/__tests__/error-codes.spec.ts`

**Interfaces:**
- Produces: `ErrorCode.INVALID_FILE_TYPE`, `ErrorCode.FILE_TOO_LARGE`, `ErrorCode.IMAGE_PROCESSING_FAILED`, `ErrorCode.PRODUCT_VARIANT_IMAGE_NOT_FOUND` in `@tiny-threads/shared`.

- [ ] **Step 1: Add new ErrorCode enum members and write test**

Add error codes in `packages/shared/src/errors/error-codes.ts`:
```typescript
INVALID_FILE_TYPE = 'INVALID_FILE_TYPE',
FILE_TOO_LARGE = 'FILE_TOO_LARGE',
IMAGE_PROCESSING_FAILED = 'IMAGE_PROCESSING_FAILED',
PRODUCT_VARIANT_IMAGE_NOT_FOUND = 'PRODUCT_VARIANT_IMAGE_NOT_FOUND',
```

Create test `packages/shared/src/errors/__tests__/error-codes.spec.ts`:
```typescript
import { ErrorCode } from '../error-codes';

describe('ErrorCode Enum', () => {
  it('should include file and image error codes', () => {
    expect(ErrorCode.INVALID_FILE_TYPE).toBe('INVALID_FILE_TYPE');
    expect(ErrorCode.FILE_TOO_LARGE).toBe('FILE_TOO_LARGE');
    expect(ErrorCode.IMAGE_PROCESSING_FAILED).toBe('IMAGE_PROCESSING_FAILED');
    expect(ErrorCode.PRODUCT_VARIANT_IMAGE_NOT_FOUND).toBe('PRODUCT_VARIANT_IMAGE_NOT_FOUND');
  });
});
```

- [ ] **Step 2: Run shared package test to verify it passes**

Run: `pnpm --filter @tiny-threads/shared test` (or build `pnpm --filter @tiny-threads/shared build`)

- [ ] **Step 3: Install backend dependencies in apps/api**

Run: `pnpm --filter @tiny-threads/api add sharp @aws-sdk/client-s3 && pnpm --filter @tiny-threads/api add -D @types/sharp @types/multer`

- [ ] **Step 4: Commit**

```bash
git add packages/shared apps/api/package.json pnpm-lock.yaml
git commit -m "feat(shared,api): add image error codes and sharp/s3 dependencies"
```

---

### Task 2: Database Migration, TypeORM Entities & RLS Verification

**Files:**
- Create: `apps/api/src/db/entities/product-variant-images.entity.ts`
- Modify: `apps/api/src/db/entities/product-variants.entity.ts`
- Modify: `apps/api/src/db/entities/merchant-users.entity.ts`
- Modify: `apps/api/src/db/entities/customers.entity.ts`
- Modify: `apps/api/src/db/entities/index.ts`
- Create: `apps/api/src/db/migrations/1723464000000-AddAvatarToUsersAndCreateVariantImages.ts`
- Test: `apps/api/src/db/__tests__/entity-metadata.spec.ts`

**Interfaces:**
- Produces: `ProductVariantImage` entity, `MerchantUser.avatarUrl`, `Customer.avatarUrl`, `ProductVariant.images` relation.

- [ ] **Step 1: Create `ProductVariantImage` entity and update existing entities**

`apps/api/src/db/entities/product-variant-images.entity.ts`:
```typescript
import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { TenantEntityBase } from './base';
import { ProductVariant } from './product-variants.entity';

@Entity({ name: 'product_variant_images' })
@Index('product_variant_images_tenant_variant_idx', ['tenantId', 'variantId', 'sortOrder'])
export class ProductVariantImage extends TenantEntityBase {
  @Column({ name: 'variant_id', type: 'uuid' })
  variantId!: string;

  @ManyToOne(() => ProductVariant, (variant) => variant.images, { onDelete: 'CASCADE' })
  @JoinColumn([
    { name: 'tenant_id', referencedColumnName: 'tenantId' },
    { name: 'variant_id', referencedColumnName: 'id' },
  ])
  variant?: ProductVariant;

  @Column({ name: 'storage_key', type: 'text' })
  storageKey!: string;

  @Column({ type: 'text' })
  url!: string;

  @Column({ name: 'alt_text', type: 'text', nullable: true })
  altText!: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary!: boolean;
}
```

Update `apps/api/src/db/entities/product-variants.entity.ts` to import `ProductVariantImage` and add:
```typescript
@OneToMany(() => ProductVariantImage, (image) => image.variant)
images?: ProductVariantImage[];
```

Update `apps/api/src/db/entities/merchant-users.entity.ts` and `apps/api/src/db/entities/customers.entity.ts` to add:
```typescript
@Column({ name: 'avatar_url', type: 'text', nullable: true })
avatarUrl!: string | null;
```

Export `ProductVariantImage` in `apps/api/src/db/entities/index.ts`.

- [ ] **Step 2: Create Migration with RLS Enabled & Forced**

`apps/api/src/db/migrations/1723464000000-AddAvatarToUsersAndCreateVariantImages.ts`:
```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';
import { enableRls, disableRls } from './helpers/rls.helper';

export class AddAvatarToUsersAndCreateVariantImages1723464000000 implements MigrationInterface {
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
    await queryRunner.query(`ALTER TABLE customers DROP COLUMN IF EXISTS avatar_url;`);
    await queryRunner.query(`ALTER TABLE merchant_users DROP COLUMN IF EXISTS avatar_url;`);
  }
}
```

- [ ] **Step 3: Run migrations and verify RLS**

Run: `pnpm --filter @tiny-threads/api test:db:up && pnpm --filter @tiny-threads/api db:migrate:test`
Expected: Migrations succeed and verify-rls passes.

- [ ] **Step 4: Run entity metadata unit tests**

Run: `pnpm --filter @tiny-threads/api test -- entity-metadata`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db
git commit -m "feat(api): add avatar columns and product_variant_images table with RLS"
```

---

### Task 3: Storage Domain Port, Configuration & Adapters

**Files:**
- Create: `apps/api/src/storage/storage.port.ts`
- Create: `apps/api/src/config/storage.config.ts`
- Create: `apps/api/src/storage/adapters/local-storage.adapter.ts`
- Create: `apps/api/src/storage/adapters/s3-storage.adapter.ts`
- Create: `apps/api/src/storage/__tests__/local-storage.adapter.spec.ts`
- Create: `apps/api/src/storage/__tests__/s3-storage.adapter.spec.ts`

**Interfaces:**
- Produces: `StoragePort`, `STORAGE_PORT`, `LocalStorageAdapter`, `S3StorageAdapter`.

- [ ] **Step 1: Write unit tests for `LocalStorageAdapter` and `S3StorageAdapter`**

`apps/api/src/storage/__tests__/local-storage.adapter.spec.ts`:
- Tests uploading a buffer creates the directory and writes file to disk.
- Tests `getUrl` returns public url formatted with base URL and path.
- Tests `delete` deletes the file and handles non-existent file without throwing.

`apps/api/src/storage/__tests__/s3-storage.adapter.spec.ts`:
- Tests `upload` issues `PutObjectCommand` with correct bucket, key, and content-type.
- Tests `delete` issues `DeleteObjectCommand`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @tiny-threads/api test -- storage.adapter`
Expected: FAIL (files not found)

- [ ] **Step 3: Implement `StoragePort`, `StorageConfig`, `LocalStorageAdapter`, `S3StorageAdapter`**

`apps/api/src/storage/storage.port.ts`:
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

`apps/api/src/config/storage.config.ts`:
```typescript
import { registerAs } from '@nestjs/config';

export const storageConfig = registerAs('storage', () => ({
  driver: process.env.STORAGE_DRIVER || 'local',
  localRoot: process.env.STORAGE_LOCAL_ROOT || './uploads',
  publicUrlBase: process.env.STORAGE_PUBLIC_URL_BASE || 'http://localhost:3000/uploads',
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    bucket: process.env.AWS_BUCKET || '',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    endpoint: process.env.AWS_ENDPOINT || undefined,
  },
}));
```

Implement `LocalStorageAdapter` with `fs/promises` and `S3StorageAdapter` with `@aws-sdk/client-s3`.

- [ ] **Step 4: Run adapter tests to verify they pass**

Run: `pnpm --filter @tiny-threads/api test -- storage.adapter`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storage apps/api/src/config/storage.config.ts
git commit -m "feat(api): add StoragePort, LocalStorageAdapter, and S3StorageAdapter"
```

---

### Task 4: Image Processing Service & StorageModule

**Files:**
- Create: `apps/api/src/storage/image-processing.service.ts`
- Create: `apps/api/src/storage/storage.module.ts`
- Modify: `apps/api/src/app/app.module.ts`
- Modify: `apps/api/src/bootstrap.ts`
- Create: `apps/api/src/storage/__tests__/image-processing.service.spec.ts`

**Interfaces:**
- Produces: `ImageProcessingService` (`processAvatar(buffer)`, `processVariantImage(buffer)`), `StorageModule`.

- [ ] **Step 1: Write unit tests for `ImageProcessingService`**

`apps/api/src/storage/__tests__/image-processing.service.spec.ts`:
- Tests valid PNG/JPEG/WebP buffers are transformed to WebP with stripped metadata.
- Tests invalid buffers throw `CodedBadRequestException` with `ErrorCode.INVALID_FILE_TYPE`.
- Tests avatar is resized to max 512×512 and variant image is resized within 2048×2048.

- [ ] **Step 2: Run image processing tests to verify they fail**

Run: `pnpm --filter @tiny-threads/api test -- image-processing`
Expected: FAIL

- [ ] **Step 3: Implement `ImageProcessingService` and `StorageModule`**

`apps/api/src/storage/image-processing.service.ts`:
- Uses `sharp(buffer)` to inspect metadata.
- Throws `CodedBadRequestException(ErrorCode.INVALID_FILE_TYPE, ...)` for unsupported formats.
- Performs `resize(512, 512, { fit: 'cover' }).webp({ quality: 85 })` for avatars.
- Performs `resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 })` for variant images.
- Returns `{ buffer: processedBuffer, contentType: 'image/webp', sizeBytes: processedBuffer.length }`.

`apps/api/src/storage/storage.module.ts`:
- Configures dynamic provider for `STORAGE_PORT` based on `storage.driver` (`LocalStorageAdapter` vs `S3StorageAdapter`).
- Exports `STORAGE_PORT` and `ImageProcessingService`.

In `apps/api/src/bootstrap.ts`:
- Add static serving for `/uploads` path using Express `express.static(uploadDir)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @tiny-threads/api test -- storage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storage apps/api/src/app/app.module.ts apps/api/src/bootstrap.ts
git commit -m "feat(api): implement ImageProcessingService and StorageModule"
```

---

### Task 5: User Profile Avatars (Merchant Admins & Customers)

**Files:**
- Create: `apps/api/src/merchant-admins/merchant-admin-avatar.service.ts`
- Create: `apps/api/src/merchant-admins/merchant-admin-avatar.controller.ts`
- Modify: `apps/api/src/merchant-admins/merchant-admins-auth.module.ts`
- Modify: `apps/api/src/merchant-admins/merchant-admins-auth.service.ts`
- Create: `apps/api/src/customers/customers-avatar.service.ts`
- Create: `apps/api/src/customers/customers-avatar.controller.ts`
- Modify: `apps/api/src/customers/customers.module.ts`
- Modify: `apps/api/src/customers/customers.service.ts`
- Create: `apps/api/src/merchant-admins/__tests__/merchant-admin-avatar.spec.ts`
- Create: `apps/api/src/customers/__tests__/customers-avatar.spec.ts`

**Interfaces:**
- Produces: `POST /merchant-admins/me/avatar`, `DELETE /merchant-admins/me/avatar`, `POST /customers/me/avatar`, `DELETE /customers/me/avatar`.

- [ ] **Step 1: Write unit tests for avatar services**

Tests:
- Upload avatar: processes image with Sharp, uploads to `tenants/{tenantId}/avatars/{userType}/{id}.webp`, updates DB row, returns `{ avatarUrl }`.
- Upload replaces existing avatar and triggers storage cleanup.
- Delete avatar: deletes file from storage and sets `avatar_url = null`.
- File size > 5MB triggers `FILE_TOO_LARGE` error.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @tiny-threads/api test -- avatar`
Expected: FAIL

- [ ] **Step 3: Implement avatar services and controllers**

`apps/api/src/merchant-admins/merchant-admin-avatar.controller.ts`:
- `@UseGuards(MerchantAdminJwtAuthGuard)`
- `@Post('me/avatar')` with `@UseInterceptors(FileInterceptor('avatar', { limits: { fileSize: 5 * 1024 * 1024 } }))`.
- `@Delete('me/avatar')` returning `@HttpCode(HttpStatus.NO_CONTENT)`.

`apps/api/src/customers/customers-avatar.controller.ts`:
- `@UseGuards(CustomerJwtAuthGuard)`
- `@Post('me/avatar')` and `@Delete('me/avatar')`.

Update `MerchantAdminsAuthService.getMe` and `CustomersService.getMe` to return `avatarUrl`.

- [ ] **Step 4: Run unit tests to verify they pass**

Run: `pnpm --filter @tiny-threads/api test -- avatar`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/merchant-admins apps/api/src/customers
git commit -m "feat(api): add avatar upload and deletion for merchant admins and customers"
```

---

### Task 6: Product Variant Images Service & Merchant Controller

**Files:**
- Create: `apps/api/src/products/dto/create-product-variant-image.dto.ts`
- Create: `apps/api/src/products/dto/update-product-variant-image.dto.ts`
- Create: `apps/api/src/products/dto/reorder-product-variant-images.dto.ts`
- Create: `apps/api/src/products/services/product-variant-images.service.ts`
- Create: `apps/api/src/products/controllers/merchant-product-variant-images.controller.ts`
- Modify: `apps/api/src/products/products.module.ts`
- Create: `apps/api/src/products/__tests__/product-variant-images.service.spec.ts`

**Interfaces:**
- Produces: `POST/GET /merchant-admins/products/:productId/variants/:variantId/images`, `PATCH/DELETE /merchant-admins/products/:productId/variants/:variantId/images/:imageId`, `PUT /merchant-admins/products/:productId/variants/:variantId/images/reorder`.

- [ ] **Step 1: Write unit tests for `ProductVariantImagesService`**

`apps/api/src/products/__tests__/product-variant-images.service.spec.ts`:
- Tests uploading image appends to `sortOrder` and sets `isPrimary = true` if first image or requested.
- Tests setting `isPrimary = true` demotes previous primary image.
- Tests listing images returns images ordered by `sortOrder ASC`.
- Tests deleting primary image auto-promotes the next image to primary.
- Tests reordering images updates `sortOrder` for all specified image IDs in transaction.
- Tests accessing image from non-existent variant/product throws `PRODUCT_VARIANT_NOT_FOUND` or `PRODUCT_VARIANT_IMAGE_NOT_FOUND`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @tiny-threads/api test -- product-variant-images`
Expected: FAIL

- [ ] **Step 3: Implement DTOs, `ProductVariantImagesService` and `MerchantProductVariantImagesController`**

Create DTOs with `class-validator`:
- `CreateProductVariantImageDto`: `@IsOptional() @IsString() altText?: string; @IsOptional() @Transform(...) @IsBoolean() isPrimary?: boolean;`
- `UpdateProductVariantImageDto`: `@IsOptional() @IsString() altText?: string; @IsOptional() @IsBoolean() isPrimary?: boolean; @IsOptional() @IsInt() sortOrder?: number;`
- `ReorderProductVariantImagesDto`: `@IsArray() @IsUUID('all', { each: true }) @ArrayNotEmpty() imageIds!: string[];`

Implement `ProductVariantImagesService`:
- Validates product and variant under current tenant.
- Processes image with `ImageProcessingService.processVariantImage`.
- Saves to `StoragePort` under `tenants/${tenantId}/products/${variantId}/${imageId}.webp`.
- Handles primary image switching and auto-promotion on delete.
- Implements `reorder` with transaction.

Implement `MerchantProductVariantImagesController` guarded with `MerchantAdminJwtAuthGuard` and `RolesGuard` (`owner`, `admin`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @tiny-threads/api test -- product-variant-images`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/products
git commit -m "feat(api): implement product variant images CRUD and reordering"
```

---

### Task 7: Storefront Integration, Multi-Tenant Isolation & E2E Verification

**Files:**
- Modify: `apps/api/src/products/services/products.service.ts`
- Modify: `apps/api/src/products/controllers/storefront-products.controller.ts`
- Create: `apps/api/test/merchant-product-variant-images.e2e-spec.ts`
- Create: `apps/api/test/user-avatars.e2e-spec.ts`

**Interfaces:**
- Produces: Storefront `GET /storefront/products` and `GET /storefront/products/:id` returning `variants.images`. E2E suite covering upload, multi-tenancy RLS isolation, and storage lifecycle.

- [ ] **Step 1: Update Storefront Products query relations**

In `apps/api/src/products/services/products.service.ts`:
- Ensure `findStorefrontProducts` and `findStorefrontProductById` load `variants.images` ordered by `sortOrder ASC`.

- [ ] **Step 2: Write E2E tests for avatars and variant images**

`apps/api/test/merchant-product-variant-images.e2e-spec.ts`:
- Tests uploading image using `supertest.attach('image', buffer, 'shirt.jpg')`.
- Tests GET, PATCH, DELETE, and PUT reorder endpoints.
- Tests RLS isolation: Tenant B cannot view, update, or delete images belonging to Tenant A.

`apps/api/test/user-avatars.e2e-spec.ts`:
- Tests avatar upload and deletion for merchant admins and customers.

- [ ] **Step 3: Run full backend test suite & E2E suite**

Run:
```bash
pnpm --filter @tiny-threads/api test
pnpm --filter @tiny-threads/api test:e2e
```
Expected: All tests pass.

- [ ] **Step 4: Run lint and typecheck**

Run:
```bash
pnpm lint
pnpm build
```
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src apps/api/test
git commit -m "feat(api): connect storefront variant images and add e2e multi-tenant test suite"
```
