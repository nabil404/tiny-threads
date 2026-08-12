# Add / Edit Product Pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Add Product (`/products/new`) and Edit Product (`/products/:id/edit`) pages in the admin-web merchant dashboard, with backend support for a `description` column, `variant name` column, and atomic multipart product creation with images.

**Architecture:** Shared `ProductForm` component used by both `CreateProductPage` and `EditProductPage`. Create flow sends a single multipart `FormData` request; the backend creates product + variants + images atomically. Edit flow uses existing PATCH + individual image upload endpoints. Frontend follows the feature module pattern (`src/features/products/`).

**Tech Stack:** NestJS 11 (backend), React 19, RTK Query, react-hook-form + Zod, Tiptap (rich text), shadcn/ui, Tailwind CSS v4

**Spec:** [`docs/superpowers/specs/2026-08-12-add-edit-product-pages-design.md`](file:///Users/nabilnms/Projects/tiny-threads/docs/superpowers/specs/2026-08-12-add-edit-product-pages-design.md)

**Stitch Design Reference:**
- Screenshot: [`stitch-assets/add-product-categories-screenshot.jpg`](file:///Users/nabilnms/.gemini/antigravity-cli/brain/0a90c92f-1df5-44ab-8fc7-bf782125615f/stitch-assets/add-product-categories-screenshot.jpg)
- HTML: [`stitch-assets/add-product-categories.html`](file:///Users/nabilnms/.gemini/antigravity-cli/brain/0a90c92f-1df5-44ab-8fc7-bf782125615f/stitch-assets/add-product-categories.html)

## Global Constraints

- Node.js ≥ 22, pnpm workspaces
- Backend: NestJS 11, TypeORM, PostgreSQL 16 with RLS, `nestjs-cls` for tenant context
- Frontend: React 19, Vite, Redux Toolkit, RTK Query, Tailwind CSS v4, shadcn/ui
- All tenant-scoped entities require `tenant_id` column; all DB operations use `this.tenantDb.run()`
- Forms use `react-hook-form` + `zodResolver` + shadcn `<Form>` primitives
- RTK Query endpoints in `src/store/api/endpoints/`, Redux slices in `src/store/slices/`
- Feature modules in `src/features/<feature>/` with `components/`, `pages/`, `schemas/`, `index.ts`
- Tests colocated in `__tests__/` subdirectories
- Error display via `extractErrorMessage()` in top-level alert banners
- Use `lucide-react` for icons (already installed)
- Existing backend paths: entities in `apps/api/src/db/entities/`, DTOs/services/controllers in `apps/api/src/products/`

---

### Task 1: Backend — Add `description` and variant `name` columns

**Files:**
- Modify: `apps/api/src/db/entities/products.entity.ts`
- Modify: `apps/api/src/db/entities/product-variants.entity.ts`
- Modify: `apps/api/src/products/dto/create-product.dto.ts`
- Modify: `apps/api/src/products/dto/update-product.dto.ts`
- Modify: `apps/api/src/products/dto/create-product-variant.dto.ts`
- Modify: `apps/api/src/products/dto/update-product-variant.dto.ts`
- Modify: `apps/api/src/products/services/products.service.ts`
- Create: migration file via `pnpm db:generate AddDescriptionAndVariantName`
- Test: `apps/api/src/products/__tests__/` (existing tests should still pass)

**Interfaces:**
- Consumes: Existing `TenantEntityBase`, `Product`, `ProductVariant` entities
- Produces: `Product.description: string | null`, `ProductVariant.name: string | null` — used by Task 2, Task 4, Task 6

- [ ] **Step 1: Add `description` column to Product entity**

In `apps/api/src/db/entities/products.entity.ts`, add after the `title` column:

```typescript
@Column({ type: 'text', nullable: true })
description!: string | null;
```

- [ ] **Step 2: Add `name` column to ProductVariant entity**

In `apps/api/src/db/entities/product-variants.entity.ts`, add after the `product` relation and before `sku`:

```typescript
@Column({ type: 'text', nullable: true })
name!: string | null;
```

- [ ] **Step 3: Update CreateProductDto**

In `apps/api/src/products/dto/create-product.dto.ts`:

Add to `CreateVariantDto`:
```typescript
@IsString({ message: field(ErrorCode.IS_STRING) })
@IsOptional()
@MaxLength(255, { message: field(ErrorCode.MAX_LENGTH) })
name?: string;
```

Add to `CreateProductDto`:
```typescript
@IsString({ message: field(ErrorCode.IS_STRING) })
@IsOptional()
@MaxLength(5000, { message: field(ErrorCode.MAX_LENGTH) })
description?: string;
```

- [ ] **Step 4: Update UpdateProductDto**

In `apps/api/src/products/dto/update-product.dto.ts`:

Add to `UpdateVariantDto`:
```typescript
@IsOptional()
@IsString({ message: field(ErrorCode.IS_STRING) })
@MaxLength(255, { message: field(ErrorCode.MAX_LENGTH) })
name?: string;
```

The `UpdateProductDto` extends `PartialType(OmitType(CreateProductDto, ['variants']))`, so `description` is automatically inherited as optional.

- [ ] **Step 5: Update CreateProductVariantDto and UpdateProductVariantDto**

In `apps/api/src/products/dto/create-product-variant.dto.ts`, add:
```typescript
@ApiPropertyOptional({ description: 'Display name for the variant', example: 'Black / Small' })
@IsString()
@IsOptional()
name?: string;
```

In `apps/api/src/products/dto/update-product-variant.dto.ts`, add:
```typescript
@ApiPropertyOptional({ description: 'Display name for the variant' })
@IsString()
@IsNotEmpty()
@IsOptional()
name?: string;
```

- [ ] **Step 6: Update ProductsService to handle new fields**

In `apps/api/src/products/services/products.service.ts`, update the `create()` method where `Product` is created:

```typescript
const product = em.create(Product, {
  tenantId,
  title: dto.title,
  description: dto.description ?? null,
  status: dto.status,
});
```

In the variant creation loop, add `name`:
```typescript
return em.create(ProductVariant, {
  tenantId,
  productId: savedProduct.id,
  name: v.name ?? null,
  sku: v.sku,
  priceCents: v.priceCents,
  stock: v.stock,
  isDefault,
});
```

In the `update()` method, add description handling:
```typescript
if (dto.description !== undefined) product.description = dto.description;
```

In the variant update section of `update()`, add name handling for existing variants:
```typescript
if (vDto.name !== undefined) existing.name = vDto.name;
```

And for new variants in the update:
```typescript
const newVar = em.create(ProductVariant, {
  tenantId,
  productId: id,
  name: vDto.name ?? null,
  sku: vDto.sku,
  priceCents: vDto.priceCents,
  stock: vDto.stock,
  isDefault,
});
```

Also update `createVariant()` and `updateVariant()` methods similarly for name handling.

- [ ] **Step 7: Generate and run the migration**

```bash
pnpm db:generate AddDescriptionAndVariantName
pnpm db:migrate
```

Verify the generated migration SQL contains:
```sql
ALTER TABLE "products" ADD "description" text;
ALTER TABLE "product_variants" ADD "name" text;
```

- [ ] **Step 8: Run existing tests**

```bash
pnpm --filter @tiny-threads/api test
```

Expected: All existing tests pass. No breaking changes — new fields are nullable/optional.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(api): add description to products and name to product variants"
```

---

### Task 2: Backend — Multipart create endpoint with atomic image upload

**Files:**
- Modify: `apps/api/src/products/controllers/merchant-products.controller.ts`
- Modify: `apps/api/src/products/services/products.service.ts`

**Interfaces:**
- Consumes: `ProductsService.create()`, `ProductVariantImagesService.uploadImage()`, `StoragePort`, `ImageProcessingService`, `CreateProductDto`
- Produces: `POST /merchant-admins/products` now accepts `multipart/form-data` with `data` JSON field and image files keyed as `variants[0].images[0]`, etc. Returns full product with variants and images.

- [ ] **Step 1: Update ProductsService to accept image files during creation**

Add imports to `apps/api/src/products/services/products.service.ts`:

```typescript
import { Inject } from '@nestjs/common';
import { STORAGE_PORT } from '../../storage/storage.port';
import type { StoragePort } from '../../storage/storage.port';
import { ImageProcessingService } from '../../storage/image-processing.service';
import { ProductVariantImage } from '../../db/entities/product-variant-images.entity';
import { randomUUID } from 'crypto';
```

Update constructor to inject storage dependencies:

```typescript
constructor(
  private readonly tenantDb: TenantDbService,
  private readonly cls: ClsService,
  @Inject(STORAGE_PORT) private readonly storagePort: StoragePort,
  private readonly imageProcessingService: ImageProcessingService,
) {}
```

Extract a private `createVariantsForProduct()` helper from the existing `create()` logic to avoid duplication:

```typescript
private async createVariantsForProduct(
  em: EntityManager,
  tenantId: string,
  productId: string,
  variants?: CreateVariantDto[],
): Promise<ProductVariant[]> {
  if (variants && variants.length > 0) {
    const skus = variants.map((v) => v.sku);
    if (new Set(skus).size !== skus.length) {
      throw new CodedBadRequestException(
        ErrorCode.VALIDATION_FAILED,
        'Duplicate SKU detected in request variants',
      );
    }
    const existingVariant = await em.findOne(ProductVariant, {
      where: { sku: In(skus) },
    });
    if (existingVariant) {
      throw new CodedConflictException(
        ErrorCode.DUPLICATE_RESOURCE,
        `Variant SKU ${existingVariant.sku} already exists`,
      );
    }
    let defaultSet = false;
    const variantsToSave = variants.map((v) => {
      let isDefault = v.isDefault ?? false;
      if (isDefault) {
        if (defaultSet) isDefault = false;
        else defaultSet = true;
      }
      return em.create(ProductVariant, {
        tenantId, productId, name: v.name ?? null,
        sku: v.sku, priceCents: v.priceCents,
        stock: v.stock, isDefault,
      });
    });
    if (!defaultSet && variantsToSave.length > 0) variantsToSave[0].isDefault = true;
    const saved = await this.saveWithUniqueCheck(() => em.save(ProductVariant, variantsToSave));
    return saved;
  } else {
    const defaultVariant = em.create(ProductVariant, {
      tenantId, productId, sku: `SKU-${productId}`,
      priceCents: 0, stock: 0, isDefault: true,
    });
    const saved = await this.saveWithUniqueCheck(() => em.save(ProductVariant, defaultVariant));
    return [saved];
  }
}
```

Refactor existing `create()` to use the helper, then add `createWithImages`:

```typescript
async createWithImages(
  dto: CreateProductDto,
  variantImageFiles: Map<number, Express.Multer.File[]>,
): Promise<Product> {
  // Process images outside the transaction to avoid holding the DB connection during I/O
  const processedImages = new Map<number, Array<{ imageId: string; buffer: Buffer; contentType: string }>>();

  for (const [variantIndex, files] of variantImageFiles) {
    const processed: Array<{ imageId: string; buffer: Buffer; contentType: string }> = [];
    for (const file of files) {
      const imageId = randomUUID();
      const result = await this.imageProcessingService.processVariantImage(file.buffer);
      processed.push({ imageId, buffer: result.buffer, contentType: result.contentType });
    }
    processedImages.set(variantIndex, processed);
  }

  return this.tenantDb.run(async (em) => {
    const tenantId = this.cls.get<string>('tenantId');

    // Validate categories
    if (dto.categoryIds && dto.categoryIds.length > 0) {
      const found = await em.find(Category, { where: { id: In(dto.categoryIds) } });
      if (found.length !== dto.categoryIds.length) {
        throw new CodedBadRequestException(ErrorCode.VALIDATION_FAILED, 'One or more provided category IDs do not exist');
      }
    }

    // Create product
    const product = em.create(Product, {
      tenantId, title: dto.title, description: dto.description ?? null, status: dto.status,
    });
    const savedProduct = await this.saveWithUniqueCheck(() => em.save(Product, product));

    // Create variants
    const savedVariants = await this.createVariantsForProduct(em, tenantId, savedProduct.id, dto.variants);

    // Create category associations
    if (dto.categoryIds && dto.categoryIds.length > 0) {
      const pcs = dto.categoryIds.map((catId) =>
        em.create(ProductCategory, { tenantId, productId: savedProduct.id, categoryId: catId }),
      );
      await em.save(ProductCategory, pcs);
    }

    // Upload images and create records
    for (const [variantIndex, images] of processedImages) {
      if (variantIndex >= savedVariants.length) continue;
      const variant = savedVariants[variantIndex];
      for (let i = 0; i < images.length; i++) {
        const { imageId, buffer, contentType } = images[i];
        const storageKey = `tenants/${tenantId}/products/${variant.id}/${imageId}.webp`;
        const { url } = await this.storagePort.upload({ key: storageKey, buffer, contentType, tenantId });
        const image = em.create(ProductVariantImage, {
          id: imageId, tenantId, variantId: variant.id,
          storageKey, url, altText: null, sortOrder: i, isPrimary: i === 0,
        });
        await em.save(ProductVariantImage, image);
      }
    }

    return this.findProductById(em, savedProduct.id);
  });
}
```

- [ ] **Step 2: Update MerchantProductsController to accept multipart**

In `apps/api/src/products/controllers/merchant-products.controller.ts`, add imports:

```typescript
import { UploadedFiles, UseInterceptors } from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { ApiConsumes } from '@nestjs/swagger';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CodedBadRequestException } from '../../common/errors/coded-exceptions';
import { ErrorCode } from '@tiny-threads/shared';
```

Add a private validation helper:

```typescript
private async validateDto<T extends object>(
  DtoClass: new () => T,
  plain: unknown,
): Promise<T> {
  const instance = plainToInstance(DtoClass, plain);
  const errors = await validate(instance);
  if (errors.length > 0) {
    throw new CodedBadRequestException(
      ErrorCode.VALIDATION_FAILED,
      errors.map((e) => Object.values(e.constraints ?? {})).flat().join('; '),
    );
  }
  return instance;
}
```

Replace the existing `create` method:

```typescript
@ApiOperation({
  summary: 'Create a new product',
  description: 'Creates a new product with optional inline variants, categories, and variant images. Accepts multipart/form-data.',
})
@ApiConsumes('multipart/form-data')
@ApiResponse({ status: 201, description: 'Product created successfully.' })
@UseGuards(MerchantAdminJwtAuthGuard, RolesGuard)
@Roles('owner', 'admin')
@Post()
@UseInterceptors(AnyFilesInterceptor({ limits: { fileSize: 10 * 1024 * 1024 } }))
async create(
  @UploadedFiles() files: Express.Multer.File[],
  @Body() body: { data?: string },
) {
  if (!body.data) {
    throw new CodedBadRequestException(
      ErrorCode.VALIDATION_FAILED,
      'Missing required "data" field in multipart request',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.data);
  } catch {
    throw new CodedBadRequestException(
      ErrorCode.VALIDATION_FAILED,
      'Invalid JSON in "data" field',
    );
  }

  const dto = await this.validateDto(CreateProductDto, parsed);

  // Map files to variant indices
  const variantImageFiles = new Map<number, Express.Multer.File[]>();
  if (files && files.length > 0) {
    for (const file of files) {
      const match = file.fieldname.match(/^variants\[(\d+)]\.images\[\d+]$/);
      if (match) {
        const idx = parseInt(match[1], 10);
        if (!variantImageFiles.has(idx)) variantImageFiles.set(idx, []);
        variantImageFiles.get(idx)!.push(file);
      }
    }
  }

  if (variantImageFiles.size > 0) {
    return this.productsService.createWithImages(dto, variantImageFiles);
  }
  return this.productsService.create(dto);
}
```

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @tiny-threads/api test
```

Expected: All existing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(api): add multipart product creation with atomic image upload"
```

---

### Task 3: Frontend — Install dependencies and shadcn components

**Files:**
- Modify: `apps/admin-web/package.json`
- Create: shadcn UI components in `apps/admin-web/src/components/ui/`

**Interfaces:**
- Consumes: Nothing
- Produces: All shadcn UI primitives and Tiptap packages available for Tasks 4–7

- [ ] **Step 1: Install Tiptap packages**

```bash
cd apps/admin-web
pnpm add @tiptap/react @tiptap/starter-kit @tiptap/extension-link
```

- [ ] **Step 2: Install shadcn components**

```bash
cd apps/admin-web
npx -y shadcn@latest add select table popover command separator sonner breadcrumb
```

If the shadcn CLI prompts for configuration, accept defaults. Verify all files are created in `src/components/ui/`.

- [ ] **Step 3: Wire up the Toaster**

In `apps/admin-web/src/App.tsx`, add the Sonner `<Toaster />` component:

```tsx
import { Toaster } from '@components/ui/sonner';

// Add inside the return, after <RouterProvider />:
<Toaster position="top-right" richColors />
```

- [ ] **Step 4: Verify build**

```bash
cd apps/admin-web
pnpm build
```

Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(admin-web): install tiptap and shadcn components for product form"
```

---

### Task 4: Frontend — RTK Query API layer and Zod schema

**Files:**
- Create: `apps/admin-web/src/store/api/endpoints/productsApi.ts`
- Create: `apps/admin-web/src/store/api/endpoints/categoriesApi.ts`
- Create: `apps/admin-web/src/store/api/endpoints/productVariantImagesApi.ts`
- Modify: `apps/admin-web/src/store/api/baseApi.ts` (add `'Categories'` tag)
- Create: `apps/admin-web/src/features/products/schemas/product-form.schema.ts`
- Create: `apps/admin-web/src/features/products/index.ts`

**Interfaces:**
- Consumes: `baseApi` from `src/store/api/baseApi.ts`
- Produces:
  - `useCreateProductMutation()` — accepts `FormData`, returns `Product`
  - `useGetProductQuery(id: string)` — returns `Product` with variants, images, categories
  - `useUpdateProductMutation()` — accepts `{ id, body }`, returns `Product`
  - `useGetCategoriesQuery()` — returns `CategoryTreeNode[]`
  - `useUploadVariantImageMutation()` — accepts `{ productId, variantId, file }`
  - `useDeleteVariantImageMutation()` — accepts `{ productId, variantId, imageId }`
  - `productFormSchema`, `ProductFormData` — Zod schema and inferred type

- [ ] **Step 1: Add `Categories` tag to baseApi**

In `apps/admin-web/src/store/api/baseApi.ts`, add `'Categories'` to the `tagTypes` array:

```typescript
tagTypes: ['Auth', 'Locale', 'Products', 'Orders', 'Settings', 'Categories'],
```

- [ ] **Step 2: Create productsApi.ts**

Create `apps/admin-web/src/store/api/endpoints/productsApi.ts`:

```typescript
import { baseApi } from '../baseApi';

export interface ProductVariantImage {
  id: string;
  variantId: string;
  storageKey: string;
  url: string;
  altText: string | null;
  sortOrder: number;
  isPrimary: boolean;
}

export interface ProductVariant {
  id: string;
  productId: string;
  name: string | null;
  sku: string;
  priceCents: number;
  stock: number;
  isDefault: boolean;
  images?: ProductVariantImage[];
}

export interface ProductCategory {
  categoryId: string;
  category?: {
    id: string;
    name: string;
    parentId: string | null;
  };
}

export interface Product {
  id: string;
  tenantId: string;
  title: string;
  description: string | null;
  status: 'draft' | 'active' | 'archived';
  variants?: ProductVariant[];
  productCategories?: ProductCategory[];
  createdAt: string;
  updatedAt: string;
}

export interface UpdateProductBody {
  title?: string;
  description?: string;
  status?: 'draft' | 'active' | 'archived';
  categoryIds?: string[];
  variants?: Array<{
    id?: string;
    name?: string;
    sku?: string;
    priceCents?: number;
    stock?: number;
    isDefault?: boolean;
  }>;
}

export const productsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    createProduct: builder.mutation<Product, FormData>({
      query: (formData) => ({
        url: '/merchant-admins/products',
        method: 'POST',
        body: formData,
        // Do NOT set Content-Type — browser sets it with boundary for multipart
      }),
      invalidatesTags: ['Products'],
    }),
    getProduct: builder.query<Product, string>({
      query: (id) => `/merchant-admins/products/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Products', id }],
    }),
    updateProduct: builder.mutation<Product, { id: string; body: UpdateProductBody }>({
      query: ({ id, body }) => ({
        url: `/merchant-admins/products/${id}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Products', id },
        'Products',
      ],
    }),
  }),
});

export const {
  useCreateProductMutation,
  useGetProductQuery,
  useUpdateProductMutation,
} = productsApi;
```

- [ ] **Step 3: Create categoriesApi.ts**

Create `apps/admin-web/src/store/api/endpoints/categoriesApi.ts`:

```typescript
import { baseApi } from '../baseApi';

export interface CategoryTreeNode {
  id: string;
  name: string;
  parentId: string | null;
  children?: CategoryTreeNode[];
}

export const categoriesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getCategories: builder.query<CategoryTreeNode[], void>({
      query: () => '/merchant-admins/categories',
      providesTags: ['Categories'],
    }),
  }),
});

export const { useGetCategoriesQuery } = categoriesApi;
```

- [ ] **Step 4: Create productVariantImagesApi.ts**

Create `apps/admin-web/src/store/api/endpoints/productVariantImagesApi.ts`:

```typescript
import { baseApi } from '../baseApi';
import type { ProductVariantImage } from './productsApi';

export const productVariantImagesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    uploadVariantImage: builder.mutation<
      ProductVariantImage,
      { productId: string; variantId: string; file: File }
    >({
      query: ({ productId, variantId, file }) => {
        const formData = new FormData();
        formData.append('image', file);
        return {
          url: `/merchant-admins/products/${productId}/variants/${variantId}/images`,
          method: 'POST',
          body: formData,
        };
      },
      invalidatesTags: ['Products'],
    }),
    deleteVariantImage: builder.mutation<
      void,
      { productId: string; variantId: string; imageId: string }
    >({
      query: ({ productId, variantId, imageId }) => ({
        url: `/merchant-admins/products/${productId}/variants/${variantId}/images/${imageId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Products'],
    }),
  }),
});

export const {
  useUploadVariantImageMutation,
  useDeleteVariantImageMutation,
} = productVariantImagesApi;
```

- [ ] **Step 5: Create Zod schema**

Create `apps/admin-web/src/features/products/schemas/product-form.schema.ts`:

```typescript
import { z } from 'zod';

export const variantFormSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().max(255).optional().default(''),
  sku: z.string().min(1, 'SKU is required').max(100),
  priceDollars: z.coerce
    .number({ invalid_type_error: 'Price must be a number' })
    .min(0, 'Price must be ≥ 0'),
  stock: z.coerce
    .number({ invalid_type_error: 'Stock must be a number' })
    .int('Stock must be a whole number')
    .min(0, 'Stock must be ≥ 0'),
  isDefault: z.boolean().default(false),
});

export const productFormSchema = z.object({
  title: z.string().min(1, 'Product name is required'),
  description: z.string().optional().default(''),
  status: z.enum(['draft', 'active', 'archived']),
  categoryIds: z.array(z.string().uuid()).default([]),
  variants: z
    .array(variantFormSchema)
    .min(1, 'At least one variant is required'),
});

export type VariantFormData = z.infer<typeof variantFormSchema>;
export type ProductFormData = z.infer<typeof productFormSchema>;

/** Convert cents from API → dollars for form display */
export function priceCentsToDollars(cents: number): number {
  return cents / 100;
}

/** Convert dollars from form → cents for API submission */
export function priceDollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}
```

- [ ] **Step 6: Create barrel export**

Create `apps/admin-web/src/features/products/index.ts`:

```typescript
export { productFormSchema, type ProductFormData } from './schemas/product-form.schema';
```

- [ ] **Step 7: Verify build**

```bash
cd apps/admin-web
pnpm build
```

Expected: Build succeeds.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(admin-web): add RTK Query product/category endpoints and Zod schema"
```

---

### Task 5: Frontend — Reusable components (RichTextEditor, CategoryMultiSelect, VariantImageUploader)

**Files:**
- Create: `apps/admin-web/src/features/products/components/RichTextEditor.tsx`
- Create: `apps/admin-web/src/features/products/components/CategoryMultiSelect.tsx`
- Create: `apps/admin-web/src/features/products/components/VariantImageUploader.tsx`

**Interfaces:**
- Consumes: `useGetCategoriesQuery()` from `categoriesApi`, `useUploadVariantImageMutation` / `useDeleteVariantImageMutation` from `productVariantImagesApi`, `CategoryTreeNode`, `ProductVariantImage`
- Produces:
  - `<RichTextEditor value={string} onChange={(html: string) => void} />` — Tiptap wrapper
  - `<CategoryMultiSelect selectedIds={string[]} onChange={(ids: string[]) => void} />` — searchable multi-select
  - `<VariantImageUploader mode={'create'|'edit'} existingImages={ProductVariantImage[]} localFiles={File[]} onLocalFilesChange={(files: File[]) => void} productId={string} variantId={string} />` — per-variant image management

- [ ] **Step 1: Create RichTextEditor component**

Create `apps/admin-web/src/features/products/components/RichTextEditor.tsx`:

```tsx
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { useEffect } from 'react';
import {
  Bold,
  Italic,
  List,
  Link as LinkIcon,
} from 'lucide-react';
import { Button } from '@components/ui/button';
import { cn } from '@/lib/utils';

export interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Enter product description...',
  className,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        code: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Link.configure({ openOnClick: false }),
    ],
    content: value,
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          'min-h-[120px] px-3.5 py-2.5 text-sm focus:outline-none prose prose-sm max-w-none',
      },
    },
  });

  // Sync external value changes (e.g. form reset)
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  if (!editor) return null;

  const toggleLink = () => {
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run();
    } else {
      const url = window.prompt('Enter URL');
      if (url) {
        editor.chain().focus().setLink({ href: url }).run();
      }
    }
  };

  return (
    <div
      className={cn(
        'rounded-lg border border-input overflow-hidden focus-within:ring-2 focus-within:ring-ring/20 focus-within:border-primary transition-all',
        className,
      )}
    >
      <div className="flex items-center gap-0.5 border-b border-input bg-muted/50 px-2 py-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            'h-7 w-7',
            editor.isActive('bold') && 'bg-accent text-accent-foreground',
          )}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            'h-7 w-7',
            editor.isActive('italic') && 'bg-accent text-accent-foreground',
          )}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            'h-7 w-7',
            editor.isActive('bulletList') && 'bg-accent text-accent-foreground',
          )}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            'h-7 w-7',
            editor.isActive('link') && 'bg-accent text-accent-foreground',
          )}
          onClick={toggleLink}
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </Button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
```

- [ ] **Step 2: Create CategoryMultiSelect component**

Create `apps/admin-web/src/features/products/components/CategoryMultiSelect.tsx`:

```tsx
import { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Button } from '@components/ui/button';
import { Badge } from '@components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@components/ui/command';
import {
  useGetCategoriesQuery,
  type CategoryTreeNode,
} from '@store/api/endpoints/categoriesApi';
import { cn } from '@/lib/utils';

export interface CategoryMultiSelectProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

/** Flatten a category tree into a flat list with depth-indented labels */
function flattenTree(
  nodes: CategoryTreeNode[],
  depth = 0,
): Array<{ id: string; name: string; depth: number }> {
  const result: Array<{ id: string; name: string; depth: number }> = [];
  for (const node of nodes) {
    result.push({ id: node.id, name: node.name, depth });
    if (node.children && node.children.length > 0) {
      result.push(...flattenTree(node.children, depth + 1));
    }
  }
  return result;
}

export function CategoryMultiSelect({
  selectedIds,
  onChange,
}: CategoryMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const { data: categoryTree = [], isLoading } = useGetCategoriesQuery();

  const flatCategories = useMemo(
    () => flattenTree(categoryTree),
    [categoryTree],
  );

  const selectedNames = useMemo(() => {
    const nameMap = new Map(flatCategories.map((c) => [c.id, c.name]));
    return selectedIds.map((id) => ({ id, name: nameMap.get(id) ?? id }));
  }, [selectedIds, flatCategories]);

  const toggleCategory = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((sid) => sid !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const removeCategory = (id: string) => {
    onChange(selectedIds.filter((sid) => sid !== id));
  };

  return (
    <div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between h-auto min-h-11 px-3.5 py-2"
          >
            <div className="flex flex-wrap gap-1 flex-1">
              {selectedNames.length > 0 ? (
                selectedNames.map(({ id, name }) => (
                  <Badge
                    key={id}
                    variant="secondary"
                    className="gap-1 pr-1"
                  >
                    {name}
                    <button
                      type="button"
                      className="ml-0.5 rounded-full hover:bg-destructive/20 p-0.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeCategory(id);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))
              ) : (
                <span className="text-muted-foreground text-sm">
                  Select categories...
                </span>
              )}
            </div>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            <CommandInput placeholder="Search categories..." />
            <CommandList>
              <CommandEmpty>
                {isLoading ? 'Loading...' : 'No categories found.'}
              </CommandEmpty>
              <CommandGroup>
                {flatCategories.map((cat) => (
                  <CommandItem
                    key={cat.id}
                    value={cat.name}
                    onSelect={() => toggleCategory(cat.id)}
                    className="cursor-pointer"
                  >
                    <div
                      style={{ paddingLeft: `${cat.depth * 16}px` }}
                      className="flex items-center gap-2 w-full"
                    >
                      <div
                        className={cn(
                          'flex h-4 w-4 items-center justify-center rounded border border-primary',
                          selectedIds.includes(cat.id)
                            ? 'bg-primary text-primary-foreground'
                            : 'opacity-50',
                        )}
                      >
                        {selectedIds.includes(cat.id) && (
                          <Check className="h-3 w-3" />
                        )}
                      </div>
                      <span>{cat.name}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
```

- [ ] **Step 3: Create VariantImageUploader component**

Create `apps/admin-web/src/features/products/components/VariantImageUploader.tsx`:

```tsx
import { useRef } from 'react';
import { Plus, Image as ImageIcon, X } from 'lucide-react';
import {
  useUploadVariantImageMutation,
  useDeleteVariantImageMutation,
} from '@store/api/endpoints/productVariantImagesApi';
import type { ProductVariantImage } from '@store/api/endpoints/productsApi';

export interface VariantImageUploaderProps {
  mode: 'create' | 'edit';
  /** Existing images from the server (edit mode) */
  existingImages?: ProductVariantImage[];
  /** Locally queued files (create mode) */
  localFiles: File[];
  onLocalFilesChange: (files: File[]) => void;
  /** Required for edit mode API calls */
  productId?: string;
  variantId?: string;
}

export function VariantImageUploader({
  mode,
  existingImages = [],
  localFiles,
  onLocalFilesChange,
  productId,
  variantId,
}: VariantImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadImage] = useUploadVariantImageMutation();
  const [deleteImage] = useDeleteVariantImageMutation();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    if (mode === 'create') {
      onLocalFilesChange([...localFiles, ...files]);
    } else if (productId && variantId) {
      for (const file of files) {
        await uploadImage({ productId, variantId, file });
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveLocal = (index: number) => {
    onLocalFilesChange(localFiles.filter((_, i) => i !== index));
  };

  const handleRemoveExisting = async (imageId: string) => {
    if (productId && variantId) {
      await deleteImage({ productId, variantId, imageId });
    }
  };

  return (
    <div className="flex items-center gap-1 overflow-x-auto py-1 max-w-[120px]">
      {existingImages.map((img) => (
        <div
          key={img.id}
          className="relative w-10 h-10 shrink-0 border border-border rounded bg-muted group"
        >
          <img
            src={img.url}
            alt={img.altText ?? ''}
            className="w-full h-full object-cover rounded"
          />
          {mode === 'edit' && (
            <button
              type="button"
              className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => handleRemoveExisting(img.id)}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
      ))}

      {localFiles.map((file, idx) => (
        <div
          key={`local-${idx}`}
          className="relative w-10 h-10 shrink-0 border border-border rounded bg-muted group"
        >
          <img
            src={URL.createObjectURL(file)}
            alt={file.name}
            className="w-full h-full object-cover rounded"
          />
          <button
            type="button"
            className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => handleRemoveLocal(idx)}
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      ))}

      {existingImages.length === 0 && localFiles.length === 0 && (
        <div className="w-10 h-10 shrink-0 border border-border rounded bg-muted flex items-center justify-center">
          <ImageIcon className="h-4 w-4 text-muted-foreground" />
        </div>
      )}

      <button
        type="button"
        className="w-10 h-10 shrink-0 border border-dashed border-border rounded bg-muted flex items-center justify-center cursor-pointer hover:bg-accent transition-colors"
        onClick={() => fileInputRef.current?.click()}
      >
        <Plus className="h-4 w-4 text-muted-foreground" />
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

```bash
cd apps/admin-web
pnpm build
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(admin-web): add RichTextEditor, CategoryMultiSelect, and VariantImageUploader components"
```

---

### Task 6: Frontend — ProductForm shell and section components

**Files:**
- Create: `apps/admin-web/src/features/products/components/GeneralInfoSection.tsx`
- Create: `apps/admin-web/src/features/products/components/VariantsSection.tsx`
- Create: `apps/admin-web/src/features/products/components/VariantRow.tsx`
- Create: `apps/admin-web/src/features/products/components/OrganizationSidebar.tsx`
- Create: `apps/admin-web/src/features/products/components/ProductForm.tsx`

**Interfaces:**
- Consumes: `RichTextEditor`, `CategoryMultiSelect`, `VariantImageUploader`, `productFormSchema`, `ProductFormData`, shadcn primitives
- Produces: `<ProductForm mode={'create'|'edit'} initialData={ProductFormData} onSubmit={fn} isSubmitting={boolean} />` — used by Task 7

- [ ] **Step 1: Create GeneralInfoSection**

Create `apps/admin-web/src/features/products/components/GeneralInfoSection.tsx`:

```tsx
import { useFormContext } from 'react-hook-form';
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@components/ui/form';
import { Input } from '@components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@components/ui/card';
import { RichTextEditor } from './RichTextEditor';
import { CategoryMultiSelect } from './CategoryMultiSelect';
import type { ProductFormData } from '../schemas/product-form.schema';

export function GeneralInfoSection() {
  const { control } = useFormContext<ProductFormData>();

  return (
    <Card>
      <CardHeader>
        <CardTitle>General Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField
          control={control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Product Name *</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g. Minimalist Ceramic Vase"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <RichTextEditor
                  value={field.value ?? ''}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="categoryIds"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <FormControl>
                <CategoryMultiSelect
                  selectedIds={field.value ?? []}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create VariantRow**

Create `apps/admin-web/src/features/products/components/VariantRow.tsx`:

```tsx
import { useFormContext } from 'react-hook-form';
import { Trash2 } from 'lucide-react';
import {
  FormField,
  FormItem,
  FormControl,
} from '@components/ui/form';
import { Input } from '@components/ui/input';
import { Button } from '@components/ui/button';
import { TableCell, TableRow } from '@components/ui/table';
import { VariantImageUploader } from './VariantImageUploader';
import type { ProductFormData } from '../schemas/product-form.schema';
import type { ProductVariantImage } from '@store/api/endpoints/productsApi';

export interface VariantRowProps {
  index: number;
  mode: 'create' | 'edit';
  canDelete: boolean;
  onRemove: () => void;
  localFiles: File[];
  onLocalFilesChange: (files: File[]) => void;
  existingImages?: ProductVariantImage[];
  productId?: string;
  variantId?: string;
}

export function VariantRow({
  index,
  mode,
  canDelete,
  onRemove,
  localFiles,
  onLocalFilesChange,
  existingImages = [],
  productId,
  variantId,
}: VariantRowProps) {
  const { control } = useFormContext<ProductFormData>();

  return (
    <TableRow>
      <TableCell className="px-3 py-2">
        <VariantImageUploader
          mode={mode}
          existingImages={existingImages}
          localFiles={localFiles}
          onLocalFilesChange={onLocalFilesChange}
          productId={productId}
          variantId={variantId}
        />
      </TableCell>

      <TableCell className="px-3 py-2">
        <FormField
          control={control}
          name={`variants.${index}.name`}
          render={({ field }) => (
            <FormItem className="space-y-0">
              <FormControl>
                <Input placeholder="Variant name" {...field} />
              </FormControl>
            </FormItem>
          )}
        />
      </TableCell>

      <TableCell className="px-3 py-2">
        <FormField
          control={control}
          name={`variants.${index}.sku`}
          render={({ field }) => (
            <FormItem className="space-y-0">
              <FormControl>
                <Input placeholder="e.g. SKU-123" {...field} />
              </FormControl>
            </FormItem>
          )}
        />
      </TableCell>

      <TableCell className="px-3 py-2">
        <FormField
          control={control}
          name={`variants.${index}.priceDollars`}
          render={({ field }) => (
            <FormItem className="space-y-0">
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  {...field}
                />
              </FormControl>
            </FormItem>
          )}
        />
      </TableCell>

      <TableCell className="px-3 py-2">
        <FormField
          control={control}
          name={`variants.${index}.stock`}
          render={({ field }) => (
            <FormItem className="space-y-0">
              <FormControl>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  {...field}
                />
              </FormControl>
            </FormItem>
          )}
        />
      </TableCell>

      <TableCell className="px-3 py-2 text-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          disabled={!canDelete}
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
```

- [ ] **Step 3: Create VariantsSection**

Create `apps/admin-web/src/features/products/components/VariantsSection.tsx`:

```tsx
import { useFieldArray, useFormContext } from 'react-hook-form';
import { Plus } from 'lucide-react';
import { Button } from '@components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@components/ui/card';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@components/ui/table';
import { VariantRow } from './VariantRow';
import type { ProductFormData } from '../schemas/product-form.schema';
import type { ProductVariantImage } from '@store/api/endpoints/productsApi';

export interface VariantsSectionProps {
  mode: 'create' | 'edit';
  variantImages: Map<number, File[]>;
  onVariantImagesChange: (images: Map<number, File[]>) => void;
  existingVariantImages?: Map<number, ProductVariantImage[]>;
  productId?: string;
  variantIds?: Map<number, string>;
}

export function VariantsSection({
  mode,
  variantImages,
  onVariantImagesChange,
  existingVariantImages = new Map(),
  productId,
  variantIds = new Map(),
}: VariantsSectionProps) {
  const { control, formState } = useFormContext<ProductFormData>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'variants',
  });

  const handleAddVariant = () => {
    append({
      name: '',
      sku: '',
      priceDollars: 0,
      stock: 0,
      isDefault: false,
    });
  };

  const handleRemoveVariant = (index: number) => {
    remove(index);
    const newImages = new Map<number, File[]>();
    for (const [idx, files] of variantImages) {
      if (idx < index) newImages.set(idx, files);
      else if (idx > index) newImages.set(idx - 1, files);
    }
    onVariantImagesChange(newImages);
  };

  const handleLocalFilesChange = (index: number, files: File[]) => {
    const newImages = new Map(variantImages);
    newImages.set(index, files);
    onVariantImagesChange(newImages);
  };

  const variantsError = formState.errors.variants;
  const rootError =
    variantsError && 'root' in variantsError
      ? variantsError.root
      : variantsError && 'message' in variantsError
        ? variantsError
        : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Variants</CardTitle>
        <CardDescription>
          Manage inventory and pricing for product variations.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="border border-border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[130px]">Image</TableHead>
                <TableHead>Variant Name</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="w-[120px]">Price ($)</TableHead>
                <TableHead className="w-[100px]">Stock</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((field, index) => (
                <VariantRow
                  key={field.id}
                  index={index}
                  mode={mode}
                  canDelete={fields.length > 1}
                  onRemove={() => handleRemoveVariant(index)}
                  localFiles={variantImages.get(index) ?? []}
                  onLocalFilesChange={(files) =>
                    handleLocalFilesChange(index, files)
                  }
                  existingImages={existingVariantImages.get(index)}
                  productId={productId}
                  variantId={variantIds.get(index)}
                />
              ))}
            </TableBody>
          </Table>
        </div>

        <Button
          type="button"
          variant="ghost"
          className="mt-3 text-primary"
          onClick={handleAddVariant}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Variant
        </Button>

        {rootError && (
          <p className="mt-1 text-xs font-medium text-destructive">
            {rootError.message as string}
          </p>
        )}

        <p className="mt-2 text-xs text-muted-foreground">
          At least one variant is required. The last remaining variant cannot
          be deleted.
        </p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Create OrganizationSidebar**

Create `apps/admin-web/src/features/products/components/OrganizationSidebar.tsx`:

```tsx
import { useFormContext } from 'react-hook-form';
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@components/ui/card';
import type { ProductFormData } from '../schemas/product-form.schema';

export function OrganizationSidebar() {
  const { control } = useFormContext<ProductFormData>();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization</CardTitle>
      </CardHeader>
      <CardContent>
        <FormField
          control={control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select
                onValueChange={field.onChange}
                defaultValue={field.value}
                value={field.value}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Create ProductForm shell**

Create `apps/admin-web/src/features/products/components/ProductForm.tsx`:

```tsx
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Form } from '@components/ui/form';
import { Button } from '@components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@components/ui/breadcrumb';
import { GeneralInfoSection } from './GeneralInfoSection';
import { VariantsSection } from './VariantsSection';
import { OrganizationSidebar } from './OrganizationSidebar';
import {
  productFormSchema,
  type ProductFormData,
} from '../schemas/product-form.schema';
import type { ProductVariantImage } from '@store/api/endpoints/productsApi';

export interface ProductFormProps {
  mode: 'create' | 'edit';
  initialData?: ProductFormData;
  onSubmit: (
    data: ProductFormData,
    localImages: Map<number, File[]>,
  ) => Promise<void>;
  isSubmitting: boolean;
  error?: string | null;
  existingVariantImages?: Map<number, ProductVariantImage[]>;
  productId?: string;
  variantIds?: Map<number, string>;
}

const DEFAULT_FORM_DATA: ProductFormData = {
  title: '',
  description: '',
  status: 'draft',
  categoryIds: [],
  variants: [
    { name: '', sku: '', priceDollars: 0, stock: 0, isDefault: true },
  ],
};

export function ProductForm({
  mode,
  initialData,
  onSubmit,
  isSubmitting,
  error,
  existingVariantImages,
  productId,
  variantIds,
}: ProductFormProps) {
  const navigate = useNavigate();
  const [variantImages, setVariantImages] = useState<Map<number, File[]>>(
    new Map(),
  );

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productFormSchema),
    defaultValues: initialData ?? DEFAULT_FORM_DATA,
  });

  const handleSubmit = async (data: ProductFormData) => {
    await onSubmit(data, variantImages);
  };

  const pageTitle =
    mode === 'create' ? 'Add New Product' : 'Edit Product';
  const pageDescription =
    mode === 'create'
      ? 'Create a new product listing in your catalog.'
      : 'Update your product details, variants, and categories.';

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/products">Products</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{pageTitle}</h1>
          <p className="text-sm text-muted-foreground">{pageDescription}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/products')}
          >
            Discard
          </Button>
          <Button
            type="submit"
            form="product-form"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : 'Save Product'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Form {...form}>
        <form
          id="product-form"
          onSubmit={form.handleSubmit(handleSubmit)}
          noValidate
        >
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-[1200px]">
            <div className="lg:col-span-2 space-y-6">
              <GeneralInfoSection />
              <VariantsSection
                mode={mode}
                variantImages={variantImages}
                onVariantImagesChange={setVariantImages}
                existingVariantImages={existingVariantImages}
                productId={productId}
                variantIds={variantIds}
              />
            </div>
            <div className="space-y-6">
              <OrganizationSidebar />
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
```

- [ ] **Step 6: Verify build**

```bash
cd apps/admin-web
pnpm build
```

Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(admin-web): add ProductForm shell with section components"
```

---

### Task 7: Frontend — Create & Edit product pages with routing

**Files:**
- Create: `apps/admin-web/src/features/products/pages/CreateProductPage.tsx`
- Create: `apps/admin-web/src/features/products/pages/EditProductPage.tsx`
- Modify: `apps/admin-web/src/features/products/index.ts` (add page exports)
- Modify: `apps/admin-web/src/routes/index.tsx` (add routes)
- Modify: `apps/admin-web/src/pages/products/ProductsPage.tsx` (add "Add Product" button)

**Interfaces:**
- Consumes: `<ProductForm>`, `useCreateProductMutation`, `useGetProductQuery`, `useUpdateProductMutation`, `priceDollarsToCents`, `priceCentsToDollars`, `extractErrorMessage`
- Produces: Working `/products/new` and `/products/:id/edit` routes

- [ ] **Step 1: Create CreateProductPage**

Create `apps/admin-web/src/features/products/pages/CreateProductPage.tsx`:

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useCreateProductMutation } from '@store/api/endpoints/productsApi';
import { extractErrorMessage } from '@lib/extract-error-message';
import { ProductForm } from '../components/ProductForm';
import type { ProductFormData } from '../schemas/product-form.schema';
import { priceDollarsToCents } from '../schemas/product-form.schema';

export function CreateProductPage() {
  const navigate = useNavigate();
  const [createProduct, { isLoading }] = useCreateProductMutation();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (
    data: ProductFormData,
    localImages: Map<number, File[]>,
  ) => {
    setError(null);

    try {
      const payload = {
        title: data.title,
        description: data.description || undefined,
        status: data.status,
        categoryIds: data.categoryIds.length > 0 ? data.categoryIds : undefined,
        variants: data.variants.map((v) => ({
          name: v.name || undefined,
          sku: v.sku,
          priceCents: priceDollarsToCents(v.priceDollars),
          stock: v.stock,
          isDefault: v.isDefault,
        })),
      };

      const formData = new FormData();
      formData.append('data', JSON.stringify(payload));

      for (const [variantIndex, files] of localImages) {
        files.forEach((file, imgIndex) => {
          formData.append(
            `variants[${variantIndex}].images[${imgIndex}]`,
            file,
          );
        });
      }

      const result = await createProduct(formData).unwrap();
      toast.success('Product created successfully');
      navigate(`/products/${result.id}/edit`);
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Failed to create product'));
    }
  };

  return (
    <ProductForm
      mode="create"
      onSubmit={handleSubmit}
      isSubmitting={isLoading}
      error={error}
    />
  );
}
```

- [ ] **Step 2: Create EditProductPage**

Create `apps/admin-web/src/features/products/pages/EditProductPage.tsx`:

```tsx
import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  useGetProductQuery,
  useUpdateProductMutation,
} from '@store/api/endpoints/productsApi';
import type { UpdateProductBody } from '@store/api/endpoints/productsApi';
import { extractErrorMessage } from '@lib/extract-error-message';
import { ProductForm } from '../components/ProductForm';
import type { ProductFormData } from '../schemas/product-form.schema';
import {
  priceCentsToDollars,
  priceDollarsToCents,
} from '../schemas/product-form.schema';

export function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const {
    data: product,
    isLoading: isFetching,
    isError: isFetchError,
  } = useGetProductQuery(id!, { skip: !id });
  const [updateProduct, { isLoading: isUpdating }] =
    useUpdateProductMutation();
  const [error, setError] = useState<string | null>(null);

  const initialData: ProductFormData | undefined = useMemo(() => {
    if (!product) return undefined;
    return {
      title: product.title,
      description: product.description ?? '',
      status: product.status,
      categoryIds:
        product.productCategories?.map((pc) => pc.categoryId) ?? [],
      variants: (product.variants ?? []).map((v) => ({
        id: v.id,
        name: v.name ?? '',
        sku: v.sku,
        priceDollars: priceCentsToDollars(v.priceCents),
        stock: v.stock,
        isDefault: v.isDefault,
      })),
    };
  }, [product]);

  const existingVariantImages = useMemo(() => {
    if (!product?.variants) return new Map();
    const map = new Map<number, NonNullable<typeof product.variants>[0]['images']>();
    product.variants.forEach((v, idx) => {
      if (v.images && v.images.length > 0) {
        map.set(idx, v.images);
      }
    });
    return map;
  }, [product]);

  const variantIds = useMemo(() => {
    if (!product?.variants) return new Map();
    const map = new Map<number, string>();
    product.variants.forEach((v, idx) => map.set(idx, v.id));
    return map;
  }, [product]);

  const handleSubmit = async (data: ProductFormData) => {
    if (!id) return;
    setError(null);

    try {
      const body: UpdateProductBody = {
        title: data.title,
        description: data.description || undefined,
        status: data.status,
        categoryIds: data.categoryIds,
        variants: data.variants.map((v) => ({
          id: v.id,
          name: v.name || undefined,
          sku: v.sku,
          priceCents: priceDollarsToCents(v.priceDollars),
          stock: v.stock,
          isDefault: v.isDefault,
        })),
      };

      await updateProduct({ id, body }).unwrap();
      toast.success('Product updated successfully');
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Failed to update product'));
    }
  };

  if (isFetching) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading product...</p>
      </div>
    );
  }

  if (isFetchError || !product) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-destructive">
          Product not found or failed to load.
        </p>
      </div>
    );
  }

  return (
    <ProductForm
      mode="edit"
      initialData={initialData}
      onSubmit={handleSubmit}
      isSubmitting={isUpdating}
      error={error}
      existingVariantImages={existingVariantImages}
      productId={id}
      variantIds={variantIds}
    />
  );
}
```

- [ ] **Step 3: Update barrel exports**

In `apps/admin-web/src/features/products/index.ts`:

```typescript
export { productFormSchema, type ProductFormData } from './schemas/product-form.schema';
export { CreateProductPage } from './pages/CreateProductPage';
export { EditProductPage } from './pages/EditProductPage';
```

- [ ] **Step 4: Add routes**

In `apps/admin-web/src/routes/index.tsx`, add the imports at the top:

```typescript
import { CreateProductPage, EditProductPage } from '../features/products';
```

Add the new routes inside the `AppLayout` children array, after the existing `{ path: '/products', element: <ProductsPage /> }` line:

```typescript
{ path: '/products/new', element: <CreateProductPage /> },
{ path: '/products/:id/edit', element: <EditProductPage /> },
```

- [ ] **Step 5: Add "Add Product" button to ProductsPage**

Replace the contents of `apps/admin-web/src/pages/products/ProductsPage.tsx`:

```tsx
import { Link } from 'react-router-dom';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@components/ui/card';
import { Button } from '@components/ui/button';
import { Package, Plus } from 'lucide-react';

export function ProductsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">
            Manage your store inventory, variants, and product catalog.
          </p>
        </div>
        <Button asChild>
          <Link to="/products/new">
            <Plus className="h-4 w-4 mr-1" />
            Add Product
          </Link>
        </Button>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            <span>Product Catalog</span>
          </CardTitle>
          <CardDescription>
            Product management module integration ready.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-8 text-center border border-dashed border-border rounded-lg text-muted-foreground text-sm">
            Product catalog management will be connected in upcoming features.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 6: Verify build**

```bash
cd apps/admin-web
pnpm build
```

Expected: Build succeeds with no errors.

- [ ] **Step 7: Manual smoke test**

```bash
pnpm dev:admin-web
```

Verify:
1. Navigate to `/products` — "Add Product" button is visible
2. Click "Add Product" — form loads at `/products/new` with all sections
3. Fill in fields, add a variant, attach an image
4. Click "Save Product" — (will need API running for full test)

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(admin-web): add Create and Edit product pages with routing"
```
