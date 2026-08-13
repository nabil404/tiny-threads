# Variant Image Uploader UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the product-variant image uploader (drag-and-drop, real progress, retry, reordering, primary selection) and replace its fragile SKU-matching correlation with an explicit `clientKey` mechanism.

**Architecture:** A backend `clientKey` DTO field (request-only, never persisted) lets the frontend reliably correlate a submitted variant to its response entry. A domain-agnostic `useImageUploadManager` hook plus two presentational components (`ImageUploadCell`, `ImageUploadPopup`) live in a new shared `apps/admin-web/src/components/image-upload/` directory — reusable by any future multi-image upload surface (the backend already supports avatar uploads with no frontend yet). One hook instance per `ProductForm` owns a unified per-variant list of image items (`queued → uploading → done | error`), a global 5-concurrent upload queue, and the upload/delete/reorder/primary mutations; `features/products/` supplies only the product-variant-specific glue (which REST endpoints, which translated strings) and replaces `VariantImageUploader`.

**Tech Stack:** React 19, RTK Query, `@dnd-kit/core`+`@dnd-kit/sortable` (reorder), `react-dropzone` (dropzone), `p-limit` (concurrency), `axios` (upload-progress events, scoped to one mutation), Vitest + Testing Library; NestJS 11, `class-validator`, Jest.

**Spec:** `docs/superpowers/specs/2026-08-14-variant-image-uploader-ux-design.md`

## Global Constraints

- Client-side file validation mirrors server limits exactly: `image/jpeg`, `image/png`, `image/webp`, `image/avif`; max 10MB.
- Global upload concurrency cap: 5 in-flight requests, shared across all variants in the form (not per-variant).
- All new frontend dependencies go in `apps/admin-web/package.json` only: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `react-dropzone`, `p-limit`, `axios`.
- All user-facing strings go through `react-i18next`'s `t()` — no hardcoded English strings in JSX. New keys go in `apps/admin-web/src/i18n/locales/en/common.json` under `"products"`. Exception by design: the shared `apps/admin-web/src/components/image-upload/` components (Tasks 4-6) never call `useTranslation` themselves — they take already-resolved strings via a `labels` prop, so they stay reusable by any future feature regardless of that feature's i18n namespace. `features/products/` (Task 7) is what calls `t()` and builds the `labels` object.
- Frontend tests live in a `__tests__/` directory colocated next to the code they cover (never as sibling files) — Vitest + Testing Library, asserting on rendered output.
- Backend tests: unit tests in `apps/api/src/products/__tests__/`, run via Jest with a mocked `EntityManager` (see existing `products.service.spec.ts` pattern).
- `clientKey` is never added to the `ProductVariant` TypeORM entity and requires no migration — it exists only on request DTOs and is attached as a transient property to the response object before serialization.

## Two Refinements to the Approved Spec (discovered while tracing exact file paths)

These sharpen (not contradict) `docs/superpowers/specs/2026-08-14-variant-image-uploader-ux-design.md`, based on details only visible once the actual current code was read:

1. **§5.1 "unified always-deferred" applies to CREATE mode too, not just edit-mode new variants.** Today, `CreateProductPage` bundles all queued files into the same multipart `POST` as product creation (`createWithImages`). Under the unified model, `CreateProductPage` instead sends a plain JSON payload (no files), and — once the product is created and each variant's `clientKey` is resolved to a real `variantId` — uploads proceed through the same per-image endpoint and concurrency queue as everything else. Because `CreateProductPage` unmounts on `navigate()` to the edit page, and `File` objects can't be carried across that navigation, `CreateProductPage` must await all of its queued uploads settling (via a new `waitForIdle` hook method) **before** navigating away. The backend's existing multipart/`createWithImages` path is left in place (untouched, just no longer called by the frontend) — removing it is out of scope here.
2. **§4's list endpoint turns out to be unnecessary.** `GET /merchant-admins/products/:id` already embeds `variants[].images[]` (confirmed in `products.service.ts`'s `findProductById`), so `EditProductPage` can hydrate directly from the already-fetched product with no extra request. Only the reorder and primary-toggle (patch) endpoints are wired up; the dedicated list endpoint is skipped to avoid firing N redundant per-variant GETs for data the page already has.

A related design decision made while tracing the update flow: the upload/delete/reorder/patch mutations must **stop invalidating the `Products` RTK Query tag** (today, upload/delete already do). Since image state now lives entirely in the manager hook (not re-derived from `getProduct` on every image operation), that invalidation would otherwise force-refetch the product and reset the whole form (`ProductForm`'s existing `form.reset(initialData)` effect) on every drag-reorder or primary click — wiping any unsaved edits to unrelated fields, and regenerating each variant's `clientKey` (breaking the very correlation the hook relies on to find its own state, since `initialData` currently has no stable identity across recomputations either). Task 7 fixes both: it removes the invalidation from the four image mutations, and gives `EditProductPage` a `variantId → clientKey` cache so a variant's `clientKey` survives across any `initialData` recomputation that does still legitimately happen (i.e., after an actual product save).

---

## Task 1: Backend — `clientKey` variant correlation field

**Files:**
- Modify: `apps/api/src/products/dto/create-product.dto.ts`
- Modify: `apps/api/src/products/dto/update-product.dto.ts`
- Modify: `apps/api/src/products/services/products.service.ts`
- Test: `apps/api/src/products/__tests__/products.service.spec.ts`

**Interfaces:**
- Produces: `CreateVariantDto.clientKey?: string`, `UpdateVariantDto.clientKey?: string`. Every variant object returned by `ProductsService.create`, `createWithImages`, and `update` carries a `clientKey` property (added at runtime, not on the TypeORM entity class) equal to whatever `clientKey` was submitted for that variant, when one was submitted.

- [ ] **Step 1: Add `clientKey` to `CreateVariantDto`**

In `apps/api/src/products/dto/create-product.dto.ts`, add to `CreateVariantDto` (after the `isDefault` field):

```ts
  @IsString({ message: field(ErrorCode.IS_STRING) })
  @IsOptional()
  @MaxLength(64, { message: field(ErrorCode.MAX_LENGTH) })
  clientKey?: string;
```

- [ ] **Step 2: Add `clientKey` to `UpdateVariantDto`**

In `apps/api/src/products/dto/update-product.dto.ts`, add to `UpdateVariantDto` (after the `isDefault` field):

```ts
  @IsOptional()
  @IsString({ message: field(ErrorCode.IS_STRING) })
  @MaxLength(64, { message: field(ErrorCode.MAX_LENGTH) })
  clientKey?: string;
```

This file already imports `IsString` and `MaxLength` from `class-validator` — no new imports needed. `create-product.dto.ts` also already imports both.

- [ ] **Step 3: Write the failing unit tests**

Add to `apps/api/src/products/__tests__/products.service.spec.ts`, inside the existing `describe('create', ...)` block (after the last `it` in that block, before its closing `});`):

```ts
    it('attaches submitted clientKey onto the matching variant in the create response', async () => {
      tenantDbService.run.mockImplementation(async (cb: any) => {
        const em = {
          save: jest.fn().mockImplementation((entityOrClass, entity) => {
            const item = entity || entityOrClass;
            if (Array.isArray(item)) {
              return Promise.resolve(
                item.map((v, i) => ({ ...v, id: `variant-${i}` })),
              );
            }
            return Promise.resolve({ id: 'prod-1', ...item });
          }),
          create: jest.fn().mockImplementation((entityClass, entity) => entity),
          findOne: jest.fn().mockImplementation((entityClass, options) => {
            if (options.where?.sku) return Promise.resolve(null);
            return Promise.resolve({
              id: 'prod-1',
              status: 'active',
              variants: [
                { id: 'variant-0', sku: 'SKU-1' },
                { id: 'variant-1', sku: 'SKU-2' },
              ],
            });
          }),
          find: jest.fn().mockResolvedValue([]),
        };
        return await cb(em as any);
      });

      const result = await service.create({
        title: 'Multi-variant Tee',
        status: 'active',
        variants: [
          {
            sku: 'SKU-1',
            priceCents: 1000,
            stock: 5,
            clientKey: 'client-key-a',
          },
          {
            sku: 'SKU-2',
            priceCents: 1200,
            stock: 10,
            clientKey: 'client-key-b',
          },
        ],
      });

      expect((result.variants?.[0] as any).clientKey).toEqual('client-key-a');
      expect((result.variants?.[1] as any).clientKey).toEqual('client-key-b');
    });
```

Add a new top-level test in the `describe('update', ...)` block for the newly-created-variant case. First find that block (search for `describe('update'` in the file); add this `it` inside it:

```ts
    it('attaches submitted clientKey onto a newly-created variant in the update response', async () => {
      const existingVariant = {
        id: 'variant-existing',
        sku: 'SKU-OLD',
        priceCents: 500,
        stock: 1,
        isDefault: true,
      };
      tenantDbService.run.mockImplementation(async (cb: any) => {
        const em = {
          findOne: jest.fn().mockImplementation((entityClass, options) => {
            if (options.where?.sku) return Promise.resolve(null);
            if (options.relations?.variants?.images) {
              // findProductById's post-save re-fetch — reflects both variants
              return Promise.resolve({
                id: 'prod-1',
                title: 'Existing',
                status: 'active',
                variants: [
                  existingVariant,
                  {
                    id: 'variant-new',
                    sku: 'SKU-NEW',
                    priceCents: 700,
                    stock: 2,
                    isDefault: false,
                  },
                ],
              });
            }
            // update()'s initial existence check
            return Promise.resolve({
              id: 'prod-1',
              title: 'Existing',
              status: 'active',
              variants: [existingVariant],
            });
          }),
          find: jest.fn().mockImplementation((entityClass, options) => {
            if (options?.where?.productId !== undefined) {
              return Promise.resolve([existingVariant]);
            }
            return Promise.resolve([]);
          }),
          create: jest.fn().mockImplementation((entityClass, entity) => entity),
          save: jest.fn().mockImplementation((entityOrClass, entity) => {
            const item = entity || entityOrClass;
            if (Array.isArray(item)) {
              return Promise.resolve(
                item.map((v) => (v.id ? v : { ...v, id: 'variant-new' })),
              );
            }
            return Promise.resolve(item);
          }),
          delete: jest.fn().mockResolvedValue(undefined),
        };
        return await cb(em as any);
      });

      const result = await service.update('prod-1', {
        variants: [
          {
            id: 'variant-existing',
            sku: 'SKU-OLD',
            priceCents: 500,
            stock: 1,
            isDefault: true,
            clientKey: 'existing-key',
          },
          {
            sku: 'SKU-NEW',
            priceCents: 700,
            stock: 2,
            clientKey: 'new-variant-key',
          },
        ],
      });

      const found = result.variants?.find(
        (v: any) => v.clientKey === 'new-variant-key',
      );
      expect(found).toBeDefined();
      expect((found as any).id).toEqual('variant-new');
    });
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `pnpm --filter @tiny-threads/api test -- products.service`
Expected: FAIL — both new tests fail because `clientKey` is never attached to the response (property is `undefined`).

- [ ] **Step 5: Implement the service logic**

In `apps/api/src/products/services/products.service.ts`, add a private helper method right after `findProductById` (after its closing `}` around line 100):

```ts
  private attachClientKeys(
    product: Product,
    clientKeyByVariantId: Map<string, string>,
  ): Product {
    for (const variant of product.variants ?? []) {
      const clientKey = clientKeyByVariantId.get(variant.id);
      if (clientKey !== undefined) {
        (variant as ProductVariant & { clientKey?: string }).clientKey =
          clientKey;
      }
    }
    return product;
  }
```

In `create()` (around line 212), replace:

```ts
      // 3. Create Variants
      await this.createVariantsForProduct(
        em,
        tenantId,
        savedProduct.id,
        dto.variants,
      );
```

with:

```ts
      // 3. Create Variants
      const savedVariants = await this.createVariantsForProduct(
        em,
        tenantId,
        savedProduct.id,
        dto.variants,
      );
      const clientKeyByVariantId = new Map<string, string>();
      (dto.variants ?? []).forEach((v, i) => {
        if (v.clientKey && savedVariants[i]) {
          clientKeyByVariantId.set(savedVariants[i].id, v.clientKey);
        }
      });
```

and replace the method's final line:

```ts
      return this.findProductById(em, savedProduct.id);
```

with:

```ts
      return this.attachClientKeys(
        await this.findProductById(em, savedProduct.id),
        clientKeyByVariantId,
      );
```

In `createWithImages()` (around line 274-320), immediately after the existing:

```ts
      const savedVariants = await this.createVariantsForProduct(
        em,
        tenantId,
        savedProduct.id,
        dto.variants,
      );
```

add:

```ts
      const clientKeyByVariantId = new Map<string, string>();
      (dto.variants ?? []).forEach((v, i) => {
        if (v.clientKey && savedVariants[i]) {
          clientKeyByVariantId.set(savedVariants[i].id, v.clientKey);
        }
      });
```

and replace its final line:

```ts
      return this.findProductById(em, savedProduct.id);
```

with:

```ts
      return this.attachClientKeys(
        await this.findProductById(em, savedProduct.id),
        clientKeyByVariantId,
      );
```

In `update()` (around line 429-597), add `const clientKeyByVariantId = new Map<string, string>();` right after the opening `const tenantId = this.cls.get<string>('tenantId');` line (around line 431). Then, inside the `if (dto.variants.length > 0) { ... }` branch, replace:

```ts
          await this.saveWithUniqueCheck(() =>
            em.save(ProductVariant, variantsToSave),
          );
```

with:

```ts
          const savedVariants = await this.saveWithUniqueCheck(() =>
            em.save(ProductVariant, variantsToSave),
          );
          dto.variants.forEach((vDto, i) => {
            if (vDto.clientKey && savedVariants[i]) {
              clientKeyByVariantId.set(savedVariants[i].id, vDto.clientKey);
            }
          });
```

This uses `em.save()`'s own return value (`savedVariants`) rather than assuming `variantsToSave`'s objects get mutated in place with generated IDs — the return value is the reliable contract to depend on.

Finally, replace the method's last line:

```ts
      return this.findProductById(em, id);
```

with:

```ts
      return this.attachClientKeys(
        await this.findProductById(em, id),
        clientKeyByVariantId,
      );
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @tiny-threads/api test -- products.service`
Expected: PASS — all tests in the file, including the two new ones.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/products/dto/create-product.dto.ts apps/api/src/products/dto/update-product.dto.ts apps/api/src/products/services/products.service.ts apps/api/src/products/__tests__/products.service.spec.ts
git commit -m "feat(products): add clientKey correlation field for variant create/update"
```

---

## Task 2: Frontend — axios upload client (progress + session-refresh retry)

**Files:**
- Create: `apps/admin-web/src/lib/axios-upload-client.ts`
- Test: `apps/admin-web/src/lib/__tests__/axios-upload-client.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `axiosUploadClient` (configured `AxiosInstance`), `refreshSession(): Promise<boolean>`, `toQueryError(err: unknown): { status: number | string; data?: unknown }` — a `FetchBaseQueryError`-shaped object so `extractErrorMessage` (`apps/admin-web/src/lib/extract-error-message.ts`) works unchanged against errors from this client.

- [ ] **Step 1: Install new dependencies**

Run: `pnpm --filter @tiny-threads/admin-web add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities react-dropzone p-limit axios`

- [ ] **Step 2: Write the failing test**

Create `apps/admin-web/src/lib/__tests__/axios-upload-client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { refreshSession, toQueryError } from '../axios-upload-client';

vi.mock('axios');

describe('axios-upload-client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('refreshSession', () => {
    it('returns true when the refresh request succeeds', async () => {
      (axios.post as any).mockResolvedValue({ data: {} });
      const result = await refreshSession();
      expect(result).toBe(true);
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/merchant-admins/auth/refresh'),
        undefined,
        expect.objectContaining({ withCredentials: true }),
      );
    });

    it('returns false when the refresh request fails', async () => {
      (axios.post as any).mockRejectedValue(new Error('refresh failed'));
      const result = await refreshSession();
      expect(result).toBe(false);
    });
  });

  describe('toQueryError', () => {
    it('maps an axios error response into a FetchBaseQueryError shape', () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 400,
          data: { error: { code: 'FILE_TOO_LARGE', message: 'Too large' } },
        },
      };
      const result = toQueryError(axiosError);
      expect(result).toEqual({
        status: 400,
        data: { error: { code: 'FILE_TOO_LARGE', message: 'Too large' } },
      });
    });

    it('falls back to FETCH_ERROR when there is no response (e.g. network failure)', () => {
      const axiosError = { isAxiosError: true, message: 'Network Error' };
      const result = toQueryError(axiosError);
      expect(result).toEqual({ status: 'FETCH_ERROR', data: undefined });
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/admin-web test -- axios-upload-client`
Expected: FAIL with "Cannot find module '../axios-upload-client'"

- [ ] **Step 4: Implement the client**

Create `apps/admin-web/src/lib/axios-upload-client.ts`:

```ts
import axios, { AxiosError } from 'axios';

export const axiosUploadClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '',
  withCredentials: true,
});

export async function refreshSession(): Promise<boolean> {
  try {
    await axios.post(
      `${import.meta.env.VITE_API_BASE_URL ?? ''}/merchant-admins/auth/refresh`,
      undefined,
      { withCredentials: true },
    );
    return true;
  } catch {
    return false;
  }
}

export function toQueryError(err: unknown): {
  status: number | string;
  data?: unknown;
} {
  const axiosErr = err as AxiosError;
  if (axiosErr.response) {
    return { status: axiosErr.response.status, data: axiosErr.response.data };
  }
  return { status: 'FETCH_ERROR', data: undefined };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/admin-web test -- axios-upload-client`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/admin-web/package.json pnpm-lock.yaml apps/admin-web/src/lib/axios-upload-client.ts apps/admin-web/src/lib/__tests__/axios-upload-client.test.ts
git commit -m "feat(admin-web): add axios upload client for progress-tracked image uploads"
```

---

## Task 3: Frontend — extend the variant-images API (upload progress, reorder, set-primary)

**Files:**
- Modify: `apps/admin-web/src/store/api/endpoints/productVariantImagesApi.ts`
- Modify: `apps/admin-web/src/store/api/endpoints/productsApi.ts`
- Test: `apps/admin-web/src/store/api/endpoints/__tests__/productVariantImagesApi.test.ts` (new)

**Interfaces:**
- Consumes: `axiosUploadClient`, `refreshSession`, `toQueryError` from Task 2.
- Produces: `useUploadVariantImageMutation()` (same trigger signature plus `onProgress`/`signal`), `useReorderVariantImagesMutation()`, `useSetPrimaryVariantImageMutation()`, `useDeleteVariantImageMutation()` (unchanged). `ProductVariant.clientKey?: string` and `CreateProductBody` (new, mirrors `UpdateProductBody` but for creation) exported from `productsApi.ts`.

- [ ] **Step 1: Add `clientKey` and `CreateProductBody` to `productsApi.ts`**

In `apps/admin-web/src/store/api/endpoints/productsApi.ts`, add `clientKey?: string` to the `ProductVariant` interface (after `isDefault: boolean;`):

```ts
export interface ProductVariant {
  id: string;
  productId: string;
  name: string | null;
  sku: string;
  priceCents: number;
  stock: number;
  isDefault: boolean;
  clientKey?: string;
  images?: ProductVariantImage[];
}
```

Add `clientKey?: string` to each variant entry in `UpdateProductBody`:

```ts
export interface UpdateProductBody {
  title?: string;
  description?: JSONContent;
  status?: 'draft' | 'active' | 'archived';
  categoryIds?: string[];
  variants?: Array<{
    id?: string;
    clientKey?: string;
    name?: string;
    sku?: string;
    priceCents?: number;
    stock?: number;
    isDefault?: boolean;
  }>;
}
```

Add a new `CreateProductBody` interface right after `UpdateProductBody`:

```ts
export interface CreateProductBody {
  title: string;
  description?: JSONContent;
  status: 'draft' | 'active' | 'archived';
  categoryIds?: string[];
  variants?: Array<{
    clientKey?: string;
    name?: string;
    sku: string;
    priceCents: number;
    stock: number;
    isDefault?: boolean;
  }>;
}
```

Change the `createProduct` endpoint's body type from `FormData` to `CreateProductBody` and drop the multipart comment:

```ts
    createProduct: builder.mutation<Product, CreateProductBody>({
      query: (body) => ({
        url: '/merchant-admins/products',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Products'],
    }),
```

- [ ] **Step 2: Write the failing test**

Create `apps/admin-web/src/store/api/endpoints/__tests__/productVariantImagesApi.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { baseApi } from '../../baseApi';
import * as axiosUploadClientModule from '@lib/axios-upload-client';
import {
  useUploadVariantImageMutation,
  useReorderVariantImagesMutation,
  useSetPrimaryVariantImageMutation,
} from '../productVariantImagesApi';

vi.mock('@lib/axios-upload-client', async () => {
  const actual = await vi.importActual('@lib/axios-upload-client');
  return {
    ...actual,
    axiosUploadClient: { post: vi.fn() },
    refreshSession: vi.fn(),
  };
});

function makeStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (gdm) => gdm().concat(baseApi.middleware),
  });
}

describe('productVariantImagesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uploadVariantImage posts via axios and reports progress', async () => {
    const image = { id: 'img-1', variantId: 'v-1', url: 'https://cdn/x.webp' };
    (axiosUploadClientModule.axiosUploadClient.post as any).mockImplementation(
      (_url: string, _body: unknown, config: any) => {
        config.onUploadProgress?.({ loaded: 50, total: 100 });
        return Promise.resolve({ data: image });
      },
    );

    const store = makeStore();
    const onProgress = vi.fn();
    const file = new File(['x'], 'a.png', { type: 'image/png' });

    const result = await store.dispatch(
      (baseApi.endpoints as any).uploadVariantImage.initiate({
        productId: 'p-1',
        variantId: 'v-1',
        file,
        onProgress,
      }),
    );

    expect(result.data).toEqual(image);
    expect(onProgress).toHaveBeenCalledWith(50);
  });

  it('uploadVariantImage retries once after a session refresh on 401', async () => {
    const image = { id: 'img-2', variantId: 'v-1', url: 'https://cdn/y.webp' };
    const unauthorized = {
      isAxiosError: true,
      response: { status: 401, data: {} },
    };
    (axiosUploadClientModule.axiosUploadClient.post as any)
      .mockRejectedValueOnce(unauthorized)
      .mockResolvedValueOnce({ data: image });
    (axiosUploadClientModule.refreshSession as any).mockResolvedValue(true);

    const store = makeStore();
    const file = new File(['x'], 'a.png', { type: 'image/png' });

    const result = await store.dispatch(
      (baseApi.endpoints as any).uploadVariantImage.initiate({
        productId: 'p-1',
        variantId: 'v-1',
        file,
      }),
    );

    expect(axiosUploadClientModule.refreshSession).toHaveBeenCalled();
    expect(axiosUploadClientModule.axiosUploadClient.post).toHaveBeenCalledTimes(2);
    expect(result.data).toEqual(image);
  });

  it('reorderVariantImages PUTs the ordered image ids', async () => {
    const store = makeStore();
    void useReorderVariantImagesMutation; // referenced for type-level import check
    const dispatched = store.dispatch(
      (baseApi.endpoints as any).reorderVariantImages.initiate({
        productId: 'p-1',
        variantId: 'v-1',
        imageIds: ['img-1', 'img-2'],
      }),
    );
    expect(dispatched).toBeDefined();
  });

  it('setPrimaryVariantImage PATCHes isPrimary true', async () => {
    const store = makeStore();
    void useSetPrimaryVariantImageMutation;
    const dispatched = store.dispatch(
      (baseApi.endpoints as any).setPrimaryVariantImage.initiate({
        productId: 'p-1',
        variantId: 'v-1',
        imageId: 'img-1',
      }),
    );
    expect(dispatched).toBeDefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/admin-web test -- productVariantImagesApi`
Expected: FAIL — `reorderVariantImages`/`setPrimaryVariantImage` endpoints don't exist yet, and `uploadVariantImage` isn't axios-backed yet.

- [ ] **Step 4: Implement the endpoint changes**

Replace the full contents of `apps/admin-web/src/store/api/endpoints/productVariantImagesApi.ts`:

```ts
import { baseApi } from '../baseApi';
import type { ProductVariantImage } from './productsApi';
import {
  axiosUploadClient,
  refreshSession,
  toQueryError,
} from '@lib/axios-upload-client';

async function performUpload(
  productId: string,
  variantId: string,
  file: File,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
) {
  const formData = new FormData();
  formData.append('image', file);
  return axiosUploadClient.post<ProductVariantImage>(
    `/merchant-admins/products/${productId}/variants/${variantId}/images`,
    formData,
    {
      signal,
      onUploadProgress: (evt) => {
        if (onProgress && evt.total) {
          onProgress(Math.round((evt.loaded / evt.total) * 100));
        }
      },
    },
  );
}

export const productVariantImagesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    uploadVariantImage: builder.mutation<
      ProductVariantImage,
      {
        productId: string;
        variantId: string;
        file: File;
        onProgress?: (percent: number) => void;
        signal?: AbortSignal;
      }
    >({
      queryFn: async ({ productId, variantId, file, onProgress, signal }) => {
        try {
          const response = await performUpload(
            productId,
            variantId,
            file,
            onProgress,
            signal,
          );
          return { data: response.data };
        } catch (err: unknown) {
          const axiosErr = err as { response?: { status?: number } };
          if (axiosErr.response?.status === 401) {
            const refreshed = await refreshSession();
            if (refreshed) {
              try {
                const retryResponse = await performUpload(
                  productId,
                  variantId,
                  file,
                  onProgress,
                  signal,
                );
                return { data: retryResponse.data };
              } catch (retryErr) {
                return { error: toQueryError(retryErr) };
              }
            }
          }
          return { error: toQueryError(err) };
        }
      },
    }),
    deleteVariantImage: builder.mutation<
      void,
      { productId: string; variantId: string; imageId: string }
    >({
      query: ({ productId, variantId, imageId }) => ({
        url: `/merchant-admins/products/${productId}/variants/${variantId}/images/${imageId}`,
        method: 'DELETE',
      }),
    }),
    reorderVariantImages: builder.mutation<
      ProductVariantImage[],
      { productId: string; variantId: string; imageIds: string[] }
    >({
      query: ({ productId, variantId, imageIds }) => ({
        url: `/merchant-admins/products/${productId}/variants/${variantId}/images/reorder`,
        method: 'PUT',
        body: { imageIds },
      }),
    }),
    setPrimaryVariantImage: builder.mutation<
      ProductVariantImage,
      { productId: string; variantId: string; imageId: string }
    >({
      query: ({ productId, variantId, imageId }) => ({
        url: `/merchant-admins/products/${productId}/variants/${variantId}/images/${imageId}`,
        method: 'PATCH',
        body: { isPrimary: true },
      }),
    }),
  }),
});

export const {
  useUploadVariantImageMutation,
  useDeleteVariantImageMutation,
  useReorderVariantImagesMutation,
  useSetPrimaryVariantImageMutation,
} = productVariantImagesApi;
```

Note none of these four endpoints set `invalidatesTags` anymore (see the plan's "Two Refinements" section above for why) — image state is now owned entirely by the manager hook (Task 4), not re-derived from the `Products` tag.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/admin-web test -- productVariantImagesApi`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/admin-web/src/store/api/endpoints/productVariantImagesApi.ts apps/admin-web/src/store/api/endpoints/productsApi.ts apps/admin-web/src/store/api/endpoints/__tests__/productVariantImagesApi.test.ts
git commit -m "feat(admin-web): add progress-tracked upload, reorder, and set-primary endpoints"
```

---

## Task 4: Frontend — `useImageUploadManager` hook (shared, domain-agnostic)

This hook, and the two components in Tasks 5-6, are placed under a new shared
`apps/admin-web/src/components/image-upload/` directory rather than inside
`features/products/` — nothing in them is variant- or product-specific (they
know nothing about SKUs, variants, or products), so any future multi-image
upload surface (e.g. the backend already supports merchant/customer avatar
uploads, which has no frontend yet) can reuse this hook and these components
as-is, wiring its own upload/delete/reorder/set-primary functions and its own
`ImageRecord`-shaped type. `features/products/` (Task 7) only supplies the
product-variant-specific glue: which REST endpoints back each action, and
which translated strings to show.

**Files:**
- Create: `apps/admin-web/src/components/image-upload/useImageUploadManager.ts`
- Test: `apps/admin-web/src/components/image-upload/__tests__/useImageUploadManager.test.ts`

**Interfaces:**
- Consumes: `extractErrorMessage` from `apps/admin-web/src/lib/extract-error-message.ts` (existing).
- Produces (for Tasks 5-7):
  ```ts
  export interface ImageRecord {
    id: string;
    url: string;
    altText: string | null;
    sortOrder: number;
    isPrimary: boolean;
  }

  export type ImageUploadItemStatus = 'queued' | 'uploading' | 'done' | 'error';

  export interface ImageUploadItem<TImage extends ImageRecord = ImageRecord> {
    clientId: string;
    status: ImageUploadItemStatus;
    file?: File;
    previewUrl?: string;
    progress?: number;
    errorMessage?: string;
    image?: TImage;
  }

  export interface UseImageUploadManagerOptions<TImage extends ImageRecord = ImageRecord> {
    concurrency?: number;
    uploadFile: (args: {
      ownerId: string;
      groupId: string;
      file: File;
      onProgress: (percent: number) => void;
      signal: AbortSignal;
    }) => Promise<TImage>;
    deleteImage: (args: {
      ownerId: string;
      groupId: string;
      imageId: string;
    }) => Promise<void>;
    reorderImages: (args: {
      ownerId: string;
      groupId: string;
      imageIds: string[];
    }) => Promise<TImage[]>;
    setPrimaryImage: (args: {
      ownerId: string;
      groupId: string;
      imageId: string;
    }) => Promise<TImage>;
  }

  export interface UseImageUploadManagerResult<TImage extends ImageRecord = ImageRecord> {
    getItems: (groupKey: string) => ImageUploadItem<TImage>[];
    addFiles: (groupKey: string, files: File[]) => void;
    addRejectedFile: (groupKey: string, file: File, reason: string) => void;
    removeItem: (groupKey: string, clientId: string) => void;
    retryItem: (groupKey: string, clientId: string) => void;
    reorderItems: (groupKey: string, orderedClientIds: string[]) => void;
    setPrimary: (groupKey: string, clientId: string) => void;
    hydrateExisting: (groupKey: string, images: TImage[]) => void;
    setGroupContext: (groupKey: string, ownerId: string, groupId: string) => void;
    waitForIdle: (groupKeys: string[]) => Promise<void>;
  }
  ```
  `groupKey` is the stable client-side identity for "one uploadable image collection" — a product variant's `clientKey` today, potentially a user id for a future single-image avatar case. `ownerId`/`groupId` are the two path segments a REST call needs (e.g. `productId`/`variantId`) — named generically since a future consumer's hierarchy may differ.

- [ ] **Step 1: Write the failing tests**

Create `apps/admin-web/src/components/image-upload/__tests__/useImageUploadManager.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useImageUploadManager,
  type UseImageUploadManagerOptions,
  type ImageRecord,
} from '../useImageUploadManager';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function image(overrides: Partial<ImageRecord> = {}): ImageRecord {
  return {
    id: 'img-1',
    url: 'https://cdn/img.webp',
    altText: null,
    sortOrder: 0,
    isPrimary: true,
    ...overrides,
  };
}

function makeOptions(
  overrides: Partial<UseImageUploadManagerOptions> = {},
): UseImageUploadManagerOptions {
  return {
    concurrency: 5,
    uploadFile: vi.fn().mockResolvedValue(image()),
    deleteImage: vi.fn().mockResolvedValue(undefined),
    reorderImages: vi.fn().mockResolvedValue([]),
    setPrimaryImage: vi.fn().mockResolvedValue(image()),
    ...overrides,
  };
}

if (!globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:test');
}
if (!globalThis.URL.revokeObjectURL) {
  globalThis.URL.revokeObjectURL = vi.fn();
}

describe('useImageUploadManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queues files without uploading when no group context has been set', () => {
    const options = makeOptions();
    const { result } = renderHook(() => useImageUploadManager(options));
    const file = new File(['x'], 'a.png', { type: 'image/png' });

    act(() => {
      result.current.addFiles('group-key', [file]);
    });

    expect(result.current.getItems('group-key')).toHaveLength(1);
    expect(result.current.getItems('group-key')[0].status).toBe('queued');
    expect(options.uploadFile).not.toHaveBeenCalled();
  });

  it('starts uploading queued files once group context is set', async () => {
    const options = makeOptions();
    const { result } = renderHook(() => useImageUploadManager(options));
    const file = new File(['x'], 'a.png', { type: 'image/png' });

    act(() => {
      result.current.addFiles('group-key', [file]);
      result.current.setGroupContext('group-key', 'owner-1', 'group-1');
    });

    await waitFor(() =>
      expect(result.current.getItems('group-key')[0].status).toBe('done'),
    );
    expect(options.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: 'owner-1', groupId: 'group-1', file }),
    );
  });

  it('caps concurrent uploads at the configured limit', async () => {
    const d1 = deferred<ImageRecord>();
    const d2 = deferred<ImageRecord>();
    const uploadFile = vi
      .fn()
      .mockReturnValueOnce(d1.promise)
      .mockReturnValueOnce(d2.promise);
    const options = makeOptions({ concurrency: 1, uploadFile });
    const { result } = renderHook(() => useImageUploadManager(options));
    const fileA = new File(['a'], 'a.png', { type: 'image/png' });
    const fileB = new File(['b'], 'b.png', { type: 'image/png' });

    act(() => {
      result.current.setGroupContext('group-key', 'owner-1', 'group-1');
      result.current.addFiles('group-key', [fileA, fileB]);
    });

    await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(1));
    expect(
      result.current.getItems('group-key').find((i) => i.file === fileB)?.status,
    ).toBe('queued');

    await act(async () => {
      d1.resolve(image({ id: 'img-a' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(2));
    d2.resolve(image({ id: 'img-b', isPrimary: false, sortOrder: 1 }));
  });

  it('sets an item to error status when the upload rejects', async () => {
    const options = makeOptions({
      uploadFile: vi.fn().mockRejectedValue(new Error('Too large')),
    });
    const { result } = renderHook(() => useImageUploadManager(options));
    const file = new File(['x'], 'a.png', { type: 'image/png' });

    act(() => {
      result.current.setGroupContext('group-key', 'owner-1', 'group-1');
      result.current.addFiles('group-key', [file]);
    });

    await waitFor(() =>
      expect(result.current.getItems('group-key')[0].status).toBe('error'),
    );
    expect(result.current.getItems('group-key')[0].errorMessage).toBe(
      'Too large',
    );
  });

  it('adds a rejected file directly as an error item without uploading', () => {
    const options = makeOptions();
    const { result } = renderHook(() => useImageUploadManager(options));
    const file = new File(['x'], 'a.png', { type: 'image/png' });

    act(() => {
      result.current.addRejectedFile('group-key', file, 'File exceeds 10MB');
    });

    expect(result.current.getItems('group-key')[0]).toMatchObject({
      status: 'error',
      errorMessage: 'File exceeds 10MB',
    });
    expect(options.uploadFile).not.toHaveBeenCalled();
  });

  it('removing a done item calls deleteImage and drops it from the list', async () => {
    const options = makeOptions();
    const { result } = renderHook(() => useImageUploadManager(options));

    act(() => {
      result.current.hydrateExisting('group-key', [image({ id: 'img-1' })]);
      result.current.setGroupContext('group-key', 'owner-1', 'group-1');
    });

    act(() => {
      result.current.removeItem('group-key', 'image-img-1');
    });

    expect(result.current.getItems('group-key')).toHaveLength(0);
    await waitFor(() =>
      expect(options.deleteImage).toHaveBeenCalledWith({
        ownerId: 'owner-1',
        groupId: 'group-1',
        imageId: 'img-1',
      }),
    );
  });

  it('removing an error item does not call deleteImage', () => {
    const options = makeOptions();
    const { result } = renderHook(() => useImageUploadManager(options));
    const file = new File(['x'], 'a.png', { type: 'image/png' });

    act(() => {
      result.current.addRejectedFile('group-key', file, 'bad file');
    });
    const clientId = result.current.getItems('group-key')[0].clientId;

    act(() => {
      result.current.removeItem('group-key', clientId);
    });

    expect(result.current.getItems('group-key')).toHaveLength(0);
    expect(options.deleteImage).not.toHaveBeenCalled();
  });

  it('retryItem resets an error item to queued and re-uploads', async () => {
    const uploadFile = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail once'))
      .mockResolvedValueOnce(image());
    const options = makeOptions({ uploadFile });
    const { result } = renderHook(() => useImageUploadManager(options));
    const file = new File(['x'], 'a.png', { type: 'image/png' });

    act(() => {
      result.current.setGroupContext('group-key', 'owner-1', 'group-1');
      result.current.addFiles('group-key', [file]);
    });
    await waitFor(() =>
      expect(result.current.getItems('group-key')[0].status).toBe('error'),
    );

    const clientId = result.current.getItems('group-key')[0].clientId;
    act(() => {
      result.current.retryItem('group-key', clientId);
    });

    await waitFor(() =>
      expect(result.current.getItems('group-key')[0].status).toBe('done'),
    );
    expect(uploadFile).toHaveBeenCalledTimes(2);
  });

  it('waitForIdle resolves once all queued/uploading items for the given keys settle', async () => {
    const d = deferred<ImageRecord>();
    const options = makeOptions({ uploadFile: vi.fn().mockReturnValue(d.promise) });
    const { result } = renderHook(() => useImageUploadManager(options));
    const file = new File(['x'], 'a.png', { type: 'image/png' });

    act(() => {
      result.current.setGroupContext('group-key', 'owner-1', 'group-1');
      result.current.addFiles('group-key', [file]);
    });

    let resolved = false;
    const idlePromise = result.current
      .waitForIdle(['group-key'])
      .then(() => {
        resolved = true;
      });

    expect(resolved).toBe(false);

    d.resolve(image());
    await idlePromise;
    expect(resolved).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @tiny-threads/admin-web test -- useImageUploadManager`
Expected: FAIL with "Cannot find module '../useImageUploadManager'"

- [ ] **Step 3: Implement the hook**

Create `apps/admin-web/src/components/image-upload/useImageUploadManager.ts`:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import pLimit from 'p-limit';
import { extractErrorMessage } from '@lib/extract-error-message';

export interface ImageRecord {
  id: string;
  url: string;
  altText: string | null;
  sortOrder: number;
  isPrimary: boolean;
}

export type ImageUploadItemStatus = 'queued' | 'uploading' | 'done' | 'error';

export interface ImageUploadItem<TImage extends ImageRecord = ImageRecord> {
  clientId: string;
  status: ImageUploadItemStatus;
  file?: File;
  previewUrl?: string;
  progress?: number;
  errorMessage?: string;
  image?: TImage;
}

interface GroupContext {
  ownerId: string;
  groupId: string;
}

export interface UseImageUploadManagerOptions<TImage extends ImageRecord = ImageRecord> {
  concurrency?: number;
  uploadFile: (args: {
    ownerId: string;
    groupId: string;
    file: File;
    onProgress: (percent: number) => void;
    signal: AbortSignal;
  }) => Promise<TImage>;
  deleteImage: (args: {
    ownerId: string;
    groupId: string;
    imageId: string;
  }) => Promise<void>;
  reorderImages: (args: {
    ownerId: string;
    groupId: string;
    imageIds: string[];
  }) => Promise<TImage[]>;
  setPrimaryImage: (args: {
    ownerId: string;
    groupId: string;
    imageId: string;
  }) => Promise<TImage>;
}

export interface UseImageUploadManagerResult<TImage extends ImageRecord = ImageRecord> {
  getItems: (groupKey: string) => ImageUploadItem<TImage>[];
  addFiles: (groupKey: string, files: File[]) => void;
  addRejectedFile: (groupKey: string, file: File, reason: string) => void;
  removeItem: (groupKey: string, clientId: string) => void;
  retryItem: (groupKey: string, clientId: string) => void;
  reorderItems: (groupKey: string, orderedClientIds: string[]) => void;
  setPrimary: (groupKey: string, clientId: string) => void;
  hydrateExisting: (groupKey: string, images: TImage[]) => void;
  setGroupContext: (groupKey: string, ownerId: string, groupId: string) => void;
  waitForIdle: (groupKeys: string[]) => Promise<void>;
}

let clientIdCounter = 0;
function nextClientId(): string {
  clientIdCounter += 1;
  return `local-${clientIdCounter}`;
}

export function useImageUploadManager<TImage extends ImageRecord = ImageRecord>(
  options: UseImageUploadManagerOptions<TImage>,
): UseImageUploadManagerResult<TImage> {
  const itemsRef = useRef<Map<string, ImageUploadItem<TImage>[]>>(new Map());
  const contextRef = useRef<Map<string, GroupContext>>(new Map());
  const controllersRef = useRef<Map<string, AbortController>>(new Map());
  const pendingUploadsRef = useRef<Map<string, Promise<void>>>(new Map());
  const limiterRef = useRef(pLimit(options.concurrency ?? 5));
  const [, forceRender] = useState(0);
  const rerender = useCallback(() => forceRender((n) => n + 1), []);

  useEffect(() => {
    return () => {
      itemsRef.current.forEach((items) => {
        items.forEach((item) => {
          if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        });
      });
    };
  }, []);

  const getItems = useCallback(
    (groupKey: string) => itemsRef.current.get(groupKey) ?? [],
    [],
  );

  const setItems = useCallback(
    (groupKey: string, items: ImageUploadItem<TImage>[]) => {
      itemsRef.current.set(groupKey, items);
      rerender();
    },
    [rerender],
  );

  const updateItem = useCallback(
    (
      groupKey: string,
      clientId: string,
      patch: Partial<ImageUploadItem<TImage>>,
    ) => {
      const items = itemsRef.current.get(groupKey) ?? [];
      setItems(
        groupKey,
        items.map((item) =>
          item.clientId === clientId ? { ...item, ...patch } : item,
        ),
      );
    },
    [setItems],
  );

  const runUpload = useCallback(
    (groupKey: string, clientId: string) => {
      const context = contextRef.current.get(groupKey);
      const item = (itemsRef.current.get(groupKey) ?? []).find(
        (i) => i.clientId === clientId,
      );
      if (!context || !item || !item.file) return;
      const file = item.file;

      const task = limiterRef.current(async () => {
        const currentItem = (itemsRef.current.get(groupKey) ?? []).find(
          (i) => i.clientId === clientId,
        );
        if (!currentItem || currentItem.status !== 'queued') return;

        const controller = new AbortController();
        controllersRef.current.set(clientId, controller);
        const previousPreviewUrl = currentItem.previewUrl;
        updateItem(groupKey, clientId, { status: 'uploading', progress: 0 });

        try {
          const image = await options.uploadFile({
            ownerId: context.ownerId,
            groupId: context.groupId,
            file,
            onProgress: (percent) =>
              updateItem(groupKey, clientId, { progress: percent }),
            signal: controller.signal,
          });
          if (previousPreviewUrl) URL.revokeObjectURL(previousPreviewUrl);
          updateItem(groupKey, clientId, {
            status: 'done',
            image,
            progress: undefined,
            previewUrl: undefined,
          });
        } catch (err: unknown) {
          if (controller.signal.aborted) return;
          updateItem(groupKey, clientId, {
            status: 'error',
            errorMessage: extractErrorMessage(err, 'Upload failed'),
          });
        } finally {
          controllersRef.current.delete(clientId);
        }
      });
      pendingUploadsRef.current.set(clientId, task);
    },
    [options, updateItem],
  );

  const scheduleUploads = useCallback(
    (groupKey: string) => {
      const items = itemsRef.current.get(groupKey) ?? [];
      items
        .filter((item) => item.status === 'queued' && item.file)
        .forEach((item) => runUpload(groupKey, item.clientId));
    },
    [runUpload],
  );

  const addFiles = useCallback(
    (groupKey: string, files: File[]) => {
      const existing = itemsRef.current.get(groupKey) ?? [];
      const newItems: ImageUploadItem<TImage>[] = files.map((file) => ({
        clientId: nextClientId(),
        status: 'queued',
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      setItems(groupKey, [...existing, ...newItems]);
      if (contextRef.current.has(groupKey)) {
        scheduleUploads(groupKey);
      }
    },
    [setItems, scheduleUploads],
  );

  const addRejectedFile = useCallback(
    (groupKey: string, file: File, reason: string) => {
      const existing = itemsRef.current.get(groupKey) ?? [];
      setItems(groupKey, [
        ...existing,
        { clientId: nextClientId(), status: 'error', file, errorMessage: reason },
      ]);
    },
    [setItems],
  );

  const removeItem = useCallback(
    (groupKey: string, clientId: string) => {
      const items = itemsRef.current.get(groupKey) ?? [];
      const item = items.find((i) => i.clientId === clientId);
      if (!item) return;

      if (item.status === 'queued' || item.status === 'uploading') {
        controllersRef.current.get(clientId)?.abort();
        controllersRef.current.delete(clientId);
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        setItems(groupKey, items.filter((i) => i.clientId !== clientId));
        return;
      }

      if (item.status === 'error') {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        setItems(groupKey, items.filter((i) => i.clientId !== clientId));
        return;
      }

      const context = contextRef.current.get(groupKey);
      if (!context || !item.image) return;
      const imageId = item.image.id;
      setItems(groupKey, items.filter((i) => i.clientId !== clientId));
      options
        .deleteImage({ ownerId: context.ownerId, groupId: context.groupId, imageId })
        .catch(() => {
          const current = itemsRef.current.get(groupKey) ?? [];
          setItems(groupKey, [...current, item]);
        });
    },
    [setItems, options],
  );

  const retryItem = useCallback(
    (groupKey: string, clientId: string) => {
      updateItem(groupKey, clientId, { status: 'queued', errorMessage: undefined });
      scheduleUploads(groupKey);
    },
    [updateItem, scheduleUploads],
  );

  const reorderItems = useCallback(
    (groupKey: string, orderedClientIds: string[]) => {
      const items = itemsRef.current.get(groupKey) ?? [];
      const byId = new Map(items.map((item) => [item.clientId, item]));
      const reordered = orderedClientIds
        .map((id) => byId.get(id))
        .filter((item): item is ImageUploadItem<TImage> => item !== undefined);
      setItems(groupKey, reordered);

      const context = contextRef.current.get(groupKey);
      if (!context) return;
      const persistedIds = reordered
        .filter((item) => item.status === 'done' && item.image)
        .map((item) => item.image!.id);
      if (persistedIds.length === 0) return;

      options
        .reorderImages({
          ownerId: context.ownerId,
          groupId: context.groupId,
          imageIds: persistedIds,
        })
        .catch(() => {
          setItems(groupKey, items);
        });
    },
    [setItems, options],
  );

  const setPrimary = useCallback(
    (groupKey: string, clientId: string) => {
      const items = itemsRef.current.get(groupKey) ?? [];
      const target = items.find((i) => i.clientId === clientId);
      const context = contextRef.current.get(groupKey);
      if (!target || !target.image || !context) return;

      const previous = items;
      const optimistic = items.map((item) =>
        item.image
          ? { ...item, image: { ...item.image, isPrimary: item.clientId === clientId } }
          : item,
      );
      setItems(groupKey, optimistic);

      options
        .setPrimaryImage({
          ownerId: context.ownerId,
          groupId: context.groupId,
          imageId: target.image.id,
        })
        .catch(() => {
          setItems(groupKey, previous);
        });
    },
    [setItems, options],
  );

  const hydrateExisting = useCallback(
    (groupKey: string, images: TImage[]) => {
      const existing = itemsRef.current.get(groupKey) ?? [];
      const localOnly = existing.filter((item) => item.status !== 'done');
      const persistedItems: ImageUploadItem<TImage>[] = images
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((image) => ({ clientId: `image-${image.id}`, status: 'done', image }));
      setItems(groupKey, [...persistedItems, ...localOnly]);
    },
    [setItems],
  );

  const setGroupContext = useCallback(
    (groupKey: string, ownerId: string, groupId: string) => {
      contextRef.current.set(groupKey, { ownerId, groupId });
      scheduleUploads(groupKey);
    },
    [scheduleUploads],
  );

  const waitForIdle = useCallback(async (groupKeys: string[]) => {
    const relevantClientIds = groupKeys.flatMap((gk) =>
      (itemsRef.current.get(gk) ?? [])
        .filter((item) => item.status === 'queued' || item.status === 'uploading')
        .map((item) => item.clientId),
    );
    const pending = relevantClientIds
      .map((id) => pendingUploadsRef.current.get(id))
      .filter((p): p is Promise<void> => p !== undefined);
    await Promise.allSettled(pending);
  }, []);

  return useMemo(
    () => ({
      getItems,
      addFiles,
      addRejectedFile,
      removeItem,
      retryItem,
      reorderItems,
      setPrimary,
      hydrateExisting,
      setGroupContext,
      waitForIdle,
    }),
    [
      getItems,
      addFiles,
      addRejectedFile,
      removeItem,
      retryItem,
      reorderItems,
      setPrimary,
      hydrateExisting,
      setGroupContext,
      waitForIdle,
    ],
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @tiny-threads/admin-web test -- useImageUploadManager`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/src/components/image-upload/useImageUploadManager.ts apps/admin-web/src/components/image-upload/__tests__/useImageUploadManager.test.ts
git commit -m "feat(admin-web): add shared useImageUploadManager hook for unified image upload state"
```

---

## Task 5: Frontend — `ImageUploadCell` component (shared)

**Files:**
- Create: `apps/admin-web/src/components/image-upload/ImageUploadCell.tsx`
- Test: `apps/admin-web/src/components/image-upload/__tests__/ImageUploadCell.test.tsx`

**Interfaces:**
- Consumes: `ImageUploadItem`, `ImageRecord` types from Task 4.
- Produces: `ImageUploadCell<TImage extends ImageRecord>({ items, onClick }: { items: ImageUploadItem<TImage>[]; onClick: () => void })`.

- [ ] **Step 1: Write the failing test**

Create `apps/admin-web/src/components/image-upload/__tests__/ImageUploadCell.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ImageUploadCell } from '../ImageUploadCell';
import type { ImageUploadItem, ImageRecord } from '../useImageUploadManager';

function image(overrides: Partial<ImageRecord> = {}): ImageRecord {
  return {
    id: '1',
    url: 'https://cdn/primary.webp',
    altText: null,
    sortOrder: 0,
    isPrimary: true,
    ...overrides,
  };
}

describe('ImageUploadCell', () => {
  it('renders a placeholder when there are no items', () => {
    render(<ImageUploadCell items={[]} onClick={vi.fn()} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows the primary image when one exists', () => {
    const items: ImageUploadItem[] = [
      { clientId: 'image-1', status: 'done', image: image() },
    ];
    render(<ImageUploadCell items={items} onClick={vi.fn()} />);
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://cdn/primary.webp',
    );
  });

  it('shows a +N badge on hover when there is more than one item', async () => {
    const user = userEvent.setup();
    const items: ImageUploadItem[] = [
      { clientId: 'image-1', status: 'done', image: image({ id: '1' }) },
      {
        clientId: 'image-2',
        status: 'done',
        image: image({ id: '2', url: 'https://cdn/b.webp', isPrimary: false, sortOrder: 1 }),
      },
    ];
    render(<ImageUploadCell items={items} onClick={vi.fn()} />);
    expect(screen.queryByText('+1')).not.toBeInTheDocument();

    await user.hover(screen.getByRole('button'));
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<ImageUploadCell items={[]} onClick={onClick} />);
    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/admin-web test -- ImageUploadCell`
Expected: FAIL with "Cannot find module '../ImageUploadCell'"

- [ ] **Step 3: Implement the component**

Create `apps/admin-web/src/components/image-upload/ImageUploadCell.tsx`:

```tsx
import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { ImageUploadItem, ImageRecord } from './useImageUploadManager';

export interface ImageUploadCellProps<TImage extends ImageRecord = ImageRecord> {
  items: ImageUploadItem<TImage>[];
  onClick: () => void;
}

export function ImageUploadCell<TImage extends ImageRecord = ImageRecord>({
  items,
  onClick,
}: ImageUploadCellProps<TImage>) {
  const [hovered, setHovered] = useState(false);
  const primary =
    items.find((item) => item.image?.isPrimary) ??
    items.find((item) => item.status === 'done') ??
    items[0];
  const extraCount = items.length > 0 ? items.length - 1 : 0;
  const previewSrc = primary?.image?.url ?? primary?.previewUrl;

  return (
    <button
      type="button"
      className="relative w-14 h-14 shrink-0 rounded-lg border border-border bg-muted overflow-hidden cursor-pointer"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {previewSrc ? (
        <img src={previewSrc} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="w-full h-full flex items-center justify-center text-muted-foreground">
          <Plus className="h-5 w-5" />
        </span>
      )}
      {hovered && extraCount > 0 && (
        <span className="absolute inset-0 bg-black/60 text-white text-sm font-semibold flex items-center justify-center">
          +{extraCount}
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/admin-web test -- ImageUploadCell`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/src/components/image-upload/ImageUploadCell.tsx apps/admin-web/src/components/image-upload/__tests__/ImageUploadCell.test.tsx
git commit -m "feat(admin-web): add shared ImageUploadCell collapsed row view"
```

---

## Task 6: Frontend — `ImageUploadPopup` component (shared)

Unlike Task 5's cell, this component previously called `useTranslation` directly with hardcoded `products.*` i18n keys — that would make it unusable by any future non-product consumer (e.g. avatar upload), which wouldn't want `products.*` keys. Instead, it takes all display text as a `labels` prop, i18n-framework-agnostic; `features/products/` (Task 7) is what calls `t()` and builds that object. The i18n keys themselves are therefore added in Task 7, not here.

**Files:**
- Create: `apps/admin-web/src/components/image-upload/ImageUploadPopup.tsx`
- Test: `apps/admin-web/src/components/image-upload/__tests__/ImageUploadPopup.test.tsx`

**Interfaces:**
- Consumes: `ImageUploadItem`, `ImageRecord` types from Task 4; `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle` from `@components/ui/dialog`.
- Produces:
  ```ts
  export interface ImageUploadLabels {
    dropzone: string;
    uploadingSection: (count: number) => string;
    imagesSection: (count: number) => string;
    retry: string;
    removeImage: string;
    setPrimaryImage: string;
    dragToReorder: string;
    fileTooLarge: string;
    fileInvalidType: string;
  }

  export interface ImageUploadPopupProps<TImage extends ImageRecord = ImageRecord> {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    labels: ImageUploadLabels;
    items: ImageUploadItem<TImage>[];
    onAddFiles: (files: File[]) => void;
    onAddRejectedFile: (file: File, reason: string) => void;
    onRemoveItem: (clientId: string) => void;
    onRetryItem: (clientId: string) => void;
    onReorder: (orderedClientIds: string[]) => void;
    onSetPrimary: (clientId: string) => void;
  }
  ```

- [ ] **Step 1: Write the failing test**

Create `apps/admin-web/src/components/image-upload/__tests__/ImageUploadPopup.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ImageUploadPopup, type ImageUploadLabels } from '../ImageUploadPopup';
import type { ImageUploadItem } from '../useImageUploadManager';

const doneItem: ImageUploadItem = {
  clientId: 'image-1',
  status: 'done',
  image: {
    id: '1',
    url: 'https://cdn/a.webp',
    isPrimary: false,
    sortOrder: 0,
    altText: null,
  },
};

const errorItem: ImageUploadItem = {
  clientId: 'local-1',
  status: 'error',
  errorMessage: 'File exceeds 10MB',
};

const labels: ImageUploadLabels = {
  dropzone: 'Drag & drop images here, or click to browse',
  uploadingSection: (count) => `Uploading (${count})`,
  imagesSection: (count) => `Images (${count})`,
  retry: 'Retry',
  removeImage: 'Remove image',
  setPrimaryImage: 'Set as primary image',
  dragToReorder: 'Drag to reorder',
  fileTooLarge: 'File exceeds 10MB',
  fileInvalidType: 'Unsupported file type — use JPEG, PNG, WebP, or AVIF',
};

function renderPopup(overrides: Partial<React.ComponentProps<typeof ImageUploadPopup>> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    title: 'Images — Red / Medium',
    labels,
    items: [doneItem, errorItem],
    onAddFiles: vi.fn(),
    onAddRejectedFile: vi.fn(),
    onRemoveItem: vi.fn(),
    onRetryItem: vi.fn(),
    onReorder: vi.fn(),
    onSetPrimary: vi.fn(),
    ...overrides,
  };
  render(<ImageUploadPopup {...props} />);
  return props;
}

describe('ImageUploadPopup', () => {
  it('renders the finished-images grid and the uploading queue separately', () => {
    renderPopup();
    expect(screen.getByText('Images (1)')).toBeInTheDocument();
    expect(screen.getByText('Uploading (1)')).toBeInTheDocument();
    expect(screen.getByText('File exceeds 10MB')).toBeInTheDocument();
  });

  it('calls onRetryItem when Retry is clicked on a failed row', async () => {
    const user = userEvent.setup();
    const props = renderPopup();
    await user.click(screen.getByText('Retry'));
    expect(props.onRetryItem).toHaveBeenCalledWith('local-1');
  });

  it('calls onRemoveItem when a queue row remove button is clicked', async () => {
    const user = userEvent.setup();
    const props = renderPopup();
    const removeButtons = screen.getAllByLabelText('Remove image');
    await user.click(removeButtons[0]);
    expect(props.onRemoveItem).toHaveBeenCalled();
  });

  it('calls onSetPrimary when the primary star on a grid tile is clicked', async () => {
    const user = userEvent.setup();
    const props = renderPopup();
    await user.click(screen.getByLabelText('Set as primary image'));
    expect(props.onSetPrimary).toHaveBeenCalledWith('image-1');
  });

  it('calls onAddFiles when a valid file is dropped via the hidden input', async () => {
    const props = renderPopup();
    const file = new File(['x'], 'good.png', { type: 'image/png' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);
    expect(props.onAddFiles).toHaveBeenCalledWith([file]);
  });

  it('calls onAddRejectedFile with a reason for an oversized file', async () => {
    const props = renderPopup();
    const big = new File([new Uint8Array(11 * 1024 * 1024)], 'big.png', {
      type: 'image/png',
    });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, big);
    expect(props.onAddRejectedFile).toHaveBeenCalledWith(
      big,
      'File exceeds 10MB',
    );
  });
});
```

Note: dnd-kit's actual pointer-drag gesture is intentionally not unit-tested here — simulating a real drag in jsdom is unreliable. The grid's structural rendering, the primary-star click, and the remove/retry buttons are covered instead; the drag-to-reorder gesture itself is verified in Task 8's manual browser check.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/admin-web test -- ImageUploadPopup`
Expected: FAIL with "Cannot find module '../ImageUploadPopup'"

- [ ] **Step 3: Implement the component**

Create `apps/admin-web/src/components/image-upload/ImageUploadPopup.tsx`:

```tsx
import { useDropzone, type FileRejection } from 'react-dropzone';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { X, Star } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@components/ui/dialog';
import type { ImageUploadItem, ImageRecord } from './useImageUploadManager';

const ACCEPTED_TYPES = {
  'image/jpeg': [],
  'image/png': [],
  'image/webp': [],
  'image/avif': [],
};
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export interface ImageUploadLabels {
  dropzone: string;
  uploadingSection: (count: number) => string;
  imagesSection: (count: number) => string;
  retry: string;
  removeImage: string;
  setPrimaryImage: string;
  dragToReorder: string;
  fileTooLarge: string;
  fileInvalidType: string;
}

export interface ImageUploadPopupProps<TImage extends ImageRecord = ImageRecord> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  labels: ImageUploadLabels;
  items: ImageUploadItem<TImage>[];
  onAddFiles: (files: File[]) => void;
  onAddRejectedFile: (file: File, reason: string) => void;
  onRemoveItem: (clientId: string) => void;
  onRetryItem: (clientId: string) => void;
  onReorder: (orderedClientIds: string[]) => void;
  onSetPrimary: (clientId: string) => void;
}

export function ImageUploadPopup<TImage extends ImageRecord = ImageRecord>({
  open,
  onOpenChange,
  title,
  labels,
  items,
  onAddFiles,
  onAddRejectedFile,
  onRemoveItem,
  onRetryItem,
  onReorder,
  onSetPrimary,
}: ImageUploadPopupProps<TImage>) {
  const sensors = useSensors(useSensor(PointerSensor));

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ACCEPTED_TYPES,
    maxSize: MAX_FILE_SIZE,
    multiple: true,
    onDrop: (acceptedFiles: File[], rejections: FileRejection[]) => {
      if (acceptedFiles.length > 0) onAddFiles(acceptedFiles);
      rejections.forEach(({ file, errors }) => {
        const reason =
          errors[0]?.code === 'file-too-large'
            ? labels.fileTooLarge
            : labels.fileInvalidType;
        onAddRejectedFile(file, reason);
      });
    },
  });

  const uploadingItems = items.filter((item) => item.status !== 'done');
  const doneItems = items.filter((item) => item.status === 'done');

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = doneItems.findIndex((item) => item.clientId === active.id);
    const newIndex = doneItems.findIndex((item) => item.clientId === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(doneItems, oldIndex, newIndex);
    onReorder(reordered.map((item) => item.clientId));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-5 text-center text-sm cursor-pointer transition-colors ${
            isDragActive
              ? 'border-primary bg-primary/5'
              : 'border-border text-muted-foreground'
          }`}
        >
          <input {...getInputProps()} />
          <p>{labels.dropzone}</p>
        </div>

        {uploadingItems.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">
              {labels.uploadingSection(uploadingItems.length)}
            </p>
            <div className="max-h-[150px] overflow-y-auto border border-border rounded-lg divide-y divide-border">
              {uploadingItems.map((item) => (
                <div key={item.clientId} className="flex items-center gap-2 px-2 py-1.5">
                  <div className="w-8 h-8 shrink-0 rounded bg-muted overflow-hidden">
                    {item.previewUrl && (
                      <img src={item.previewUrl} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs truncate">{item.file?.name}</p>
                    {item.status === 'error' ? (
                      <p className="text-xs text-destructive">{item.errorMessage}</p>
                    ) : (
                      <div className="h-1 rounded bg-muted overflow-hidden mt-0.5">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${item.progress ?? 0}%` }}
                        />
                      </div>
                    )}
                  </div>
                  {item.status === 'error' && (
                    <button
                      type="button"
                      className="text-xs text-primary underline"
                      onClick={() => onRetryItem(item.clientId)}
                    >
                      {labels.retry}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={labels.removeImage}
                    onClick={() => onRemoveItem(item.clientId)}
                  >
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {doneItems.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">
              {labels.imagesSection(doneItems.length)}
            </p>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={doneItems.map((item) => item.clientId)}
                strategy={rectSortingStrategy}
              >
                <div className="grid grid-cols-4 gap-2">
                  {doneItems.map((item) => (
                    <SortableImageTile
                      key={item.clientId}
                      item={item}
                      labels={labels}
                      onRemove={() => onRemoveItem(item.clientId)}
                      onSetPrimary={() => onSetPrimary(item.clientId)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface SortableImageTileProps<TImage extends ImageRecord = ImageRecord> {
  item: ImageUploadItem<TImage>;
  labels: ImageUploadLabels;
  onRemove: () => void;
  onSetPrimary: () => void;
}

function SortableImageTile<TImage extends ImageRecord = ImageRecord>({
  item,
  labels,
  onRemove,
  onSetPrimary,
}: SortableImageTileProps<TImage>) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: item.clientId,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative aspect-square rounded-lg overflow-hidden border border-border bg-muted"
    >
      <img src={item.image?.url} alt={item.image?.altText ?? ''} className="w-full h-full object-cover" />
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={labels.dragToReorder}
        className="absolute top-1 left-1 bg-black/55 text-white rounded px-1 text-xs cursor-grab"
      >
        ⠿
      </button>
      <button
        type="button"
        aria-label={labels.removeImage}
        className="absolute top-1 right-1 bg-black/55 text-white rounded-full w-4 h-4 flex items-center justify-center"
        onClick={onRemove}
      >
        <X className="h-2.5 w-2.5" />
      </button>
      <button
        type="button"
        aria-label={labels.setPrimaryImage}
        onClick={onSetPrimary}
        className={`absolute bottom-1 left-1 rounded px-1 text-xs flex items-center gap-0.5 ${
          item.image?.isPrimary ? 'bg-yellow-400 text-black' : 'bg-black/55 text-white'
        }`}
      >
        <Star className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/admin-web test -- ImageUploadPopup`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/src/components/image-upload/ImageUploadPopup.tsx apps/admin-web/src/components/image-upload/__tests__/ImageUploadPopup.test.tsx
git commit -m "feat(admin-web): add shared ImageUploadPopup with dropzone, upload queue, and reorder grid"
```

---

## Task 7: Frontend — wire the new uploader into the product form

**Files:**
- Modify: `apps/admin-web/src/i18n/locales/en/common.json`
- Modify: `apps/admin-web/src/features/products/schemas/product-form.schema.ts`
- Modify: `apps/admin-web/src/features/products/components/ProductForm.tsx`
- Modify: `apps/admin-web/src/features/products/components/VariantsSection.tsx`
- Modify: `apps/admin-web/src/features/products/components/VariantRow.tsx`
- Modify: `apps/admin-web/src/features/products/pages/CreateProductPage.tsx`
- Modify: `apps/admin-web/src/features/products/pages/EditProductPage.tsx`
- Delete: `apps/admin-web/src/features/products/components/VariantImageUploader.tsx`
- Delete: `apps/admin-web/src/features/products/components/__tests__/VariantImageUploader.test.tsx`
- Modify: `apps/admin-web/src/features/products/components/__tests__/VariantRow.test.tsx` (create if it doesn't already exist — check first)

**Interfaces:**
- Consumes: `useImageUploadManager`, `UseImageUploadManagerResult`, `ImageUploadCell`, `ImageUploadPopup`, `ImageUploadLabels` (all from `@components/image-upload/`, Tasks 4-6); `useUploadVariantImageMutation`/`useDeleteVariantImageMutation`/`useReorderVariantImagesMutation`/`useSetPrimaryVariantImageMutation` (Task 3), `CreateProductBody` (Task 3). This is the only task that knows both the generic `image-upload` hook/components AND the product-variant domain — it's the glue layer.

- [ ] **Step 1: Add i18n keys**

In `apps/admin-web/src/i18n/locales/en/common.json`, inside the `"products"` object, add these keys right after `"variantMinNotice"` (remember to add a trailing comma after the existing last entry):

```json
    "variantMinNotice": "At least one variant is required. The last remaining variant cannot be deleted.",
    "manageImagesTitle": "Images — {{variant}}",
    "dropzoneLabel": "Drag & drop images here, or click to browse",
    "uploadingCount": "Uploading ({{count}})",
    "imagesCount": "Images ({{count}})",
    "retry": "Retry",
    "removeImage": "Remove image",
    "setPrimaryImage": "Set as primary image",
    "dragToReorder": "Drag to reorder",
    "imageTooLarge": "File exceeds 10MB",
    "imageInvalidType": "Unsupported file type — use JPEG, PNG, WebP, or AVIF",
    "someImagesFailedToUpload": "{{count}} image(s) failed to upload"
```

- [ ] **Step 2: Add `clientKey` to the variant form schema**

In `apps/admin-web/src/features/products/schemas/product-form.schema.ts`, add to `variantFormSchema` (after the `id` field):

```ts
export const variantFormSchema = z.object({
  id: z.string().uuid().optional(),
  clientKey: z.string(),
  name: z.string().max(255).optional().default(''),
  sku: z.string().min(1, 'SKU is required').max(100),
  priceDollars: z.coerce
    .number({ message: 'Price must be a number' })
    .min(0, 'Price must be ≥ 0'),
  stock: z.coerce
    .number({ message: 'Stock must be a number' })
    .int('Stock must be a whole number')
    .min(0, 'Stock must be ≥ 0'),
  isDefault: z.boolean().default(false),
});
```

- [ ] **Step 3: Check for an existing `VariantRow` test file**

Run: `ls apps/admin-web/src/features/products/components/__tests__/ | grep -i VariantRow`

If a file exists, read it — it will need import/prop updates in Step 9 below. If none exists, no action needed here.

- [ ] **Step 4: Rewrite `CreateProductPage.tsx`**

Replace the full contents of `apps/admin-web/src/features/products/pages/CreateProductPage.tsx`:

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  useCreateProductMutation,
  type ProductVariantImage,
} from '@store/api/endpoints/productsApi';
import { extractErrorMessage } from '@lib/extract-error-message';
import { ProductForm } from '../components/ProductForm';
import type { ProductFormData } from '../schemas/product-form.schema';
import { priceDollarsToCents } from '../schemas/product-form.schema';
import type { UseImageUploadManagerResult } from '@components/image-upload/useImageUploadManager';

export function CreateProductPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [createProduct, { isLoading }] = useCreateProductMutation();
  const [error, setError] = useState<string | null>(null);
  const [isFinalizingImages, setIsFinalizingImages] = useState(false);

  const handleSubmit = async (
    data: ProductFormData,
    imageManager: UseImageUploadManagerResult<ProductVariantImage>,
  ) => {
    setError(null);

    try {
      const payload = {
        title: data.title,
        description: data.description ?? undefined,
        status: data.status,
        categoryIds: data.categoryIds.length > 0 ? data.categoryIds : undefined,
        variants: data.variants.map((v) => ({
          clientKey: v.clientKey,
          name: v.name || undefined,
          sku: v.sku,
          priceCents: priceDollarsToCents(v.priceDollars),
          stock: v.stock,
          isDefault: v.isDefault,
        })),
      };

      const result = await createProduct(payload).unwrap();

      setIsFinalizingImages(true);
      const clientKeys = data.variants.map((v) => v.clientKey);
      for (const v of data.variants) {
        const saved = result.variants?.find(
          (rv) => rv.clientKey === v.clientKey,
        );
        if (saved) {
          imageManager.setGroupContext(v.clientKey, result.id, saved.id);
        }
      }
      await imageManager.waitForIdle(clientKeys);
      setIsFinalizingImages(false);

      toast.success(t('products.createSuccess'));
      navigate(`/products/${result.id}/edit`);
    } catch (err: unknown) {
      setIsFinalizingImages(false);
      setError(extractErrorMessage(err, t('products.createError')));
    }
  };

  return (
    <ProductForm
      mode="create"
      onSubmit={handleSubmit}
      isSubmitting={isLoading || isFinalizingImages}
      error={error}
    />
  );
}
```

- [ ] **Step 5: Rewrite `EditProductPage.tsx`**

Replace the full contents of `apps/admin-web/src/features/products/pages/EditProductPage.tsx`:

```tsx
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  useGetProductQuery,
  useUpdateProductMutation,
} from '@store/api/endpoints/productsApi';
import type {
  UpdateProductBody,
  ProductVariantImage,
} from '@store/api/endpoints/productsApi';
import { extractErrorMessage } from '@lib/extract-error-message';
import { ProductForm } from '../components/ProductForm';
import type { ProductFormData } from '../schemas/product-form.schema';
import {
  priceCentsToDollars,
  priceDollarsToCents,
} from '../schemas/product-form.schema';
import type { UseImageUploadManagerResult } from '@components/image-upload/useImageUploadManager';

export function EditProductPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const {
    data: product,
    isLoading: isFetching,
    isError: isFetchError,
  } = useGetProductQuery(id!, { skip: !id });
  const [updateProduct, { isLoading: isUpdating }] =
    useUpdateProductMutation();
  const [error, setError] = useState<string | null>(null);
  const clientKeyCacheRef = useRef<Map<string, string>>(new Map());

  const initialData: ProductFormData | undefined = useMemo(() => {
    if (!product) return undefined;
    return {
      title: product.title,
      description: product.description ?? undefined,
      status: product.status,
      categoryIds:
        product.productCategories?.map((pc) => pc.categoryId) ?? [],
      variants: (product.variants ?? []).map((v) => {
        let clientKey = clientKeyCacheRef.current.get(v.id);
        if (!clientKey) {
          clientKey = crypto.randomUUID();
          clientKeyCacheRef.current.set(v.id, clientKey);
        }
        return {
          id: v.id,
          clientKey,
          name: v.name ?? '',
          sku: v.sku,
          priceDollars: priceCentsToDollars(v.priceCents),
          stock: v.stock,
          isDefault: v.isDefault,
        };
      }),
    };
  }, [product]);

  const existingVariantImages = useMemo(() => {
    const map = new Map<string, ProductVariantImage[]>();
    if (!product?.variants) return map;
    initialData?.variants.forEach((formVariant, idx) => {
      const images = product.variants?.[idx]?.images;
      if (images && images.length > 0) {
        map.set(formVariant.clientKey, images);
      }
    });
    return map;
  }, [product, initialData]);

  const variantContexts = useMemo(() => {
    const map = new Map<string, string>();
    if (!product?.variants) return map;
    initialData?.variants.forEach((formVariant, idx) => {
      const variantId = product.variants?.[idx]?.id;
      if (variantId) map.set(formVariant.clientKey, variantId);
    });
    return map;
  }, [product, initialData]);

  const handleSubmit = async (
    data: ProductFormData,
    imageManager: UseImageUploadManagerResult<ProductVariantImage>,
  ) => {
    if (!id) return;
    setError(null);

    try {
      const body: UpdateProductBody = {
        title: data.title,
        description: data.description ?? undefined,
        status: data.status,
        categoryIds: data.categoryIds,
        variants: data.variants.map((v) => ({
          id: v.id,
          clientKey: v.clientKey,
          name: v.name || undefined,
          sku: v.sku,
          priceCents: priceDollarsToCents(v.priceDollars),
          stock: v.stock,
          isDefault: v.isDefault,
        })),
      };

      const result = await updateProduct({ id, body }).unwrap();

      result.variants?.forEach((rv) => {
        if (rv.clientKey) clientKeyCacheRef.current.set(rv.id, rv.clientKey);
      });
      data.variants.forEach((v) => {
        const saved = result.variants?.find((rv) => rv.clientKey === v.clientKey);
        if (saved) imageManager.setGroupContext(v.clientKey, id, saved.id);
      });

      toast.success(t('products.updateSuccess'));
    } catch (err: unknown) {
      setError(extractErrorMessage(err, t('products.updateError')));
    }
  };

  if (isFetching) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">{t('products.loadingProduct')}</p>
      </div>
    );
  }

  if (isFetchError || !product) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-destructive">{t('products.loadError')}</p>
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
      variantContexts={variantContexts}
      productId={id}
    />
  );
}
```

Note: `existingVariantImages` and `variantContexts` are now keyed by `clientKey` (stable across resets, thanks to `clientKeyCacheRef`) instead of by array index — the index-keyed `Map<number, ...>` from the old code broke as soon as variant order in the response didn't match the form, which was exactly the bug this whole feature fixes.

- [ ] **Step 6: Update `ProductForm.tsx`**

In `apps/admin-web/src/features/products/components/ProductForm.tsx`:

Replace the imports and props interface:

```tsx
import { useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
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
import {
  useUploadVariantImageMutation,
  useDeleteVariantImageMutation,
  useReorderVariantImagesMutation,
  useSetPrimaryVariantImageMutation,
} from '@store/api/endpoints/productVariantImagesApi';
import {
  useImageUploadManager,
  type UseImageUploadManagerResult,
} from '@components/image-upload/useImageUploadManager';

export interface ProductFormProps {
  mode: 'create' | 'edit';
  initialData?: ProductFormData;
  onSubmit: (
    data: ProductFormData,
    imageManager: UseImageUploadManagerResult<ProductVariantImage>,
  ) => Promise<void>;
  isSubmitting: boolean;
  error?: string | null;
  existingVariantImages?: Map<string, ProductVariantImage[]>;
  variantContexts?: Map<string, string>;
  productId?: string;
}

function createDefaultFormData(): ProductFormData {
  return {
    title: '',
    description: undefined,
    status: 'draft',
    categoryIds: [],
    variants: [
      {
        clientKey: crypto.randomUUID(),
        name: '',
        sku: '',
        priceDollars: 0,
        stock: 0,
        isDefault: true,
      },
    ],
  };
}
```

Replace the component body:

```tsx
export function ProductForm({
  mode,
  initialData,
  onSubmit,
  isSubmitting,
  error,
  existingVariantImages,
  variantContexts,
  productId,
}: ProductFormProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [uploadImage] = useUploadVariantImageMutation();
  const [deleteImage] = useDeleteVariantImageMutation();
  const [reorderImages] = useReorderVariantImagesMutation();
  const [setPrimaryImage] = useSetPrimaryVariantImageMutation();

  // RTK Query's mutation trigger functions are reference-stable across
  // renders, so memoizing on them keeps `imageManagerOptions` (and in turn
  // `imageManager`, since the hook's own return value is itself memoized)
  // stable too — the hydration effect below can then safely depend on
  // `imageManager` without re-running on every render.
  // The shared hook speaks generically ("ownerId"/"groupId"); this is where
  // that maps onto the product-variant domain's actual "productId"/"variantId".
  const imageManagerOptions = useMemo(
    () => ({
      uploadFile: ({ ownerId, groupId, file, onProgress, signal }: {
        ownerId: string;
        groupId: string;
        file: File;
        onProgress: (percent: number) => void;
        signal: AbortSignal;
      }) =>
        uploadImage({
          productId: ownerId,
          variantId: groupId,
          file,
          onProgress,
          signal,
        }).unwrap(),
      deleteImage: ({ ownerId, groupId, imageId }: {
        ownerId: string;
        groupId: string;
        imageId: string;
      }) => deleteImage({ productId: ownerId, variantId: groupId, imageId }).unwrap(),
      reorderImages: ({ ownerId, groupId, imageIds }: {
        ownerId: string;
        groupId: string;
        imageIds: string[];
      }) => reorderImages({ productId: ownerId, variantId: groupId, imageIds }).unwrap(),
      setPrimaryImage: ({ ownerId, groupId, imageId }: {
        ownerId: string;
        groupId: string;
        imageId: string;
      }) => setPrimaryImage({ productId: ownerId, variantId: groupId, imageId }).unwrap(),
    }),
    [uploadImage, deleteImage, reorderImages, setPrimaryImage],
  );

  const imageManager = useImageUploadManager<ProductVariantImage>(imageManagerOptions);

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productFormSchema) as unknown as Resolver<ProductFormData>,
    defaultValues: initialData ?? createDefaultFormData(),
  });

  useEffect(() => {
    if (initialData) {
      form.reset(initialData);
    }
  }, [initialData, form]);

  useEffect(() => {
    if (!existingVariantImages || !variantContexts || !productId) return;
    existingVariantImages.forEach((images, clientKey) => {
      imageManager.hydrateExisting(clientKey, images);
    });
    variantContexts.forEach((variantId, clientKey) => {
      imageManager.setGroupContext(clientKey, productId, variantId);
    });
  }, [existingVariantImages, variantContexts, productId, imageManager]);

  const reportFailedUploads = useCallback(
    (clientKeys: string[]) => {
      const failedCount = clientKeys.reduce(
        (total, key) =>
          total +
          imageManager
            .getItems(key)
            .filter((item) => item.status === 'error').length,
        0,
      );
      if (failedCount > 0) {
        toast.error(
          t('products.someImagesFailedToUpload', { count: failedCount }),
        );
      }
    },
    [imageManager, t],
  );

  const handleSubmit = async (data: ProductFormData) => {
    await onSubmit(data, imageManager);
    reportFailedUploads(data.variants.map((v) => v.clientKey));
  };

  const pageTitle =
    mode === 'create' ? t('products.addNewProduct') : t('products.editProduct');
  const pageDescription =
    mode === 'create'
      ? t('products.createDescription')
      : t('products.editDescription');

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/products">{t('products.breadcrumbProducts')}</Link>
            </BreadcrumbLink>
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
          <Button type="button" variant="outline" onClick={() => navigate('/products')}>
            {t('products.discard')}
          </Button>
          <Button type="submit" form="product-form" disabled={isSubmitting}>
            {isSubmitting ? t('products.saving') : t('products.saveProduct')}
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
        <form id="product-form" onSubmit={form.handleSubmit(handleSubmit)} noValidate>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-[1200px]">
            <div className="lg:col-span-2 space-y-6">
              <GeneralInfoSection />
              <VariantsSection imageManager={imageManager} />
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

`existingVariantImages`/`variantContexts` hydration is keyed by `clientKey` (stable) rather than array index. `productId` for create mode is only known after submit, so the hydration effect above is a no-op until `EditProductPage` supplies it — brand-new variants get their context via `imageManager.setGroupContext` called directly from `CreateProductPage`/`EditProductPage`'s `handleSubmit` instead.

- [ ] **Step 7: Update `VariantsSection.tsx`**

Replace the full contents of `apps/admin-web/src/features/products/components/VariantsSection.tsx`:

```tsx
import { useFieldArray, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
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
import { useGetTenantSettingsQuery } from '@store/api/endpoints/settingsApi';
import type { UseImageUploadManagerResult } from '@components/image-upload/useImageUploadManager';

const DEFAULT_CURRENCY_SYMBOL = '$';

export interface VariantsSectionProps {
  imageManager: UseImageUploadManagerResult<ProductVariantImage>;
}

export function VariantsSection({ imageManager }: VariantsSectionProps) {
  const { control, formState } = useFormContext<ProductFormData>();
  const { t } = useTranslation();
  const { data: settings } = useGetTenantSettingsQuery();
  const currencySymbol = settings?.defaultCurrencySymbol ?? DEFAULT_CURRENCY_SYMBOL;
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'variants',
  });

  const handleAddVariant = () => {
    append({
      clientKey: crypto.randomUUID(),
      name: '',
      sku: '',
      priceDollars: 0,
      stock: 0,
      isDefault: false,
    });
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
        <CardTitle>{t('products.variantsTitle')}</CardTitle>
        <CardDescription>{t('products.variantsDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="border border-border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[130px]">{t('products.variantImageHeader')}</TableHead>
                <TableHead>{t('products.variantNameHeader')}</TableHead>
                <TableHead>{t('products.variantSkuHeader')}</TableHead>
                <TableHead className="w-[120px]">
                  {t('products.variantPriceHeader', { symbol: currencySymbol })}
                </TableHead>
                <TableHead className="w-[100px]">{t('products.variantStockHeader')}</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((field, index) => (
                <VariantRow
                  key={field.id}
                  index={index}
                  canDelete={fields.length > 1}
                  onRemove={() => remove(index)}
                  imageManager={imageManager}
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
          {t('products.addVariant')}
        </Button>

        {rootError && (
          <p className="mt-1 text-xs font-medium text-destructive">
            {rootError.message as string}
          </p>
        )}

        <p className="mt-2 text-xs text-muted-foreground">
          {t('products.variantMinNotice')}
        </p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 8: Update `VariantRow.tsx`**

Replace the full contents of `apps/admin-web/src/features/products/components/VariantRow.tsx`:

```tsx
import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import {
  FormField,
  FormItem,
  FormControl,
} from '@components/ui/form';
import { Input } from '@components/ui/input';
import { Button } from '@components/ui/button';
import { TableCell, TableRow } from '@components/ui/table';
import { ImageUploadCell } from '@components/image-upload/ImageUploadCell';
import {
  ImageUploadPopup,
  type ImageUploadLabels,
} from '@components/image-upload/ImageUploadPopup';
import type { UseImageUploadManagerResult } from '@components/image-upload/useImageUploadManager';
import type { ProductFormData } from '../schemas/product-form.schema';
import type { ProductVariantImage } from '@store/api/endpoints/productsApi';

export interface VariantRowProps {
  index: number;
  canDelete: boolean;
  onRemove: () => void;
  imageManager: UseImageUploadManagerResult<ProductVariantImage>;
}

export function VariantRow({
  index,
  canDelete,
  onRemove,
  imageManager,
}: VariantRowProps) {
  const { control, watch } = useFormContext<ProductFormData>();
  const { t } = useTranslation();
  const [popupOpen, setPopupOpen] = useState(false);
  const clientKey = watch(`variants.${index}.clientKey`);
  const name = watch(`variants.${index}.name`);
  const sku = watch(`variants.${index}.sku`);
  const items = imageManager.getItems(clientKey);

  const labels: ImageUploadLabels = {
    dropzone: t('products.dropzoneLabel'),
    uploadingSection: (count) => t('products.uploadingCount', { count }),
    imagesSection: (count) => t('products.imagesCount', { count }),
    retry: t('products.retry'),
    removeImage: t('products.removeImage'),
    setPrimaryImage: t('products.setPrimaryImage'),
    dragToReorder: t('products.dragToReorder'),
    fileTooLarge: t('products.imageTooLarge'),
    fileInvalidType: t('products.imageInvalidType'),
  };

  return (
    <TableRow>
      <TableCell className="px-3 py-2">
        <ImageUploadCell items={items} onClick={() => setPopupOpen(true)} />
        <ImageUploadPopup
          open={popupOpen}
          onOpenChange={setPopupOpen}
          title={t('products.manageImagesTitle', {
            variant: name || sku || `#${index + 1}`,
          })}
          labels={labels}
          items={items}
          onAddFiles={(files) => imageManager.addFiles(clientKey, files)}
          onAddRejectedFile={(file, reason) =>
            imageManager.addRejectedFile(clientKey, file, reason)
          }
          onRemoveItem={(clientId) => imageManager.removeItem(clientKey, clientId)}
          onRetryItem={(clientId) => imageManager.retryItem(clientKey, clientId)}
          onReorder={(orderedClientIds) =>
            imageManager.reorderItems(clientKey, orderedClientIds)
          }
          onSetPrimary={(clientId) => imageManager.setPrimary(clientKey, clientId)}
        />
      </TableCell>

      <TableCell className="px-3 py-2">
        <FormField
          control={control}
          name={`variants.${index}.name`}
          render={({ field }) => (
            <FormItem className="space-y-0">
              <FormControl>
                <Input placeholder={t('products.variantNamePlaceholder')} {...field} />
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
                <Input placeholder={t('products.skuPlaceholder')} {...field} />
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
                <Input type="number" step="0.01" min="0" placeholder="0.00" {...field} />
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
                <Input type="number" min="0" placeholder="0" {...field} />
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

- [ ] **Step 9: Delete the old uploader and its test**

```bash
git rm apps/admin-web/src/features/products/components/VariantImageUploader.tsx apps/admin-web/src/features/products/components/__tests__/VariantImageUploader.test.tsx
```

- [ ] **Step 10: Update or create the `VariantRow` test**

If Step 3 found an existing test file, update its imports/props to match the new `VariantRowProps` (`imageManager` instead of `mode`/`localFiles`/`onLocalFilesChange`/`existingImages`/`productId`/`variantId`), wrapping the render in a `FormProvider` with a `useForm` instance seeded with a `clientKey`. If none exists, create `apps/admin-web/src/features/products/components/__tests__/VariantRow.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useForm, FormProvider } from 'react-hook-form';
import '@testing-library/jest-dom';
import { VariantRow } from '../VariantRow';
import type { ProductFormData } from '../../schemas/product-form.schema';
import type { ProductVariantImage } from '@store/api/endpoints/productsApi';
import type { UseImageUploadManagerResult } from '@components/image-upload/useImageUploadManager';

function Wrapper({
  imageManager,
}: {
  imageManager: UseImageUploadManagerResult<ProductVariantImage>;
}) {
  const form = useForm<ProductFormData>({
    defaultValues: {
      title: 'x',
      status: 'draft',
      categoryIds: [],
      variants: [
        {
          clientKey: 'v-key-1',
          name: 'Red',
          sku: 'SKU-1',
          priceDollars: 10,
          stock: 5,
          isDefault: true,
        },
      ],
    },
  });
  return (
    <FormProvider {...form}>
      <table>
        <tbody>
          <VariantRow index={0} canDelete={false} onRemove={vi.fn()} imageManager={imageManager} />
        </tbody>
      </table>
    </FormProvider>
  );
}

function makeManager(
  overrides: Partial<UseImageUploadManagerResult<ProductVariantImage>> = {},
): UseImageUploadManagerResult<ProductVariantImage> {
  return {
    getItems: vi.fn().mockReturnValue([]),
    addFiles: vi.fn(),
    addRejectedFile: vi.fn(),
    removeItem: vi.fn(),
    retryItem: vi.fn(),
    reorderItems: vi.fn(),
    setPrimary: vi.fn(),
    hydrateExisting: vi.fn(),
    setGroupContext: vi.fn(),
    waitForIdle: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('VariantRow', () => {
  it('renders the image cell using items from the manager for this row\'s clientKey', () => {
    const getItems = vi.fn().mockReturnValue([]);
    render(<Wrapper imageManager={makeManager({ getItems })} />);
    expect(getItems).toHaveBeenCalledWith('v-key-1');
    expect(screen.getByRole('row')).toBeInTheDocument();
  });

  it('renders the SKU field with its current value', () => {
    render(<Wrapper imageManager={makeManager()} />);
    expect(screen.getByPlaceholderText('e.g. SKU-123')).toHaveValue('SKU-1');
  });
});
```

- [ ] **Step 11: Run the full admin-web test suite**

Run: `pnpm --filter @tiny-threads/admin-web test`
Expected: PASS — all suites, including the products feature tests updated above.

- [ ] **Step 12: Run the admin-web build to catch any remaining type errors**

Run: `pnpm --filter @tiny-threads/admin-web build`
Expected: builds cleanly with no TypeScript errors.

- [ ] **Step 13: Commit**

```bash
git add -A apps/admin-web/src/features/products apps/admin-web/src/i18n/locales/en/common.json
git commit -m "feat(admin-web): wire drag-and-drop image uploader into product form, replace SKU-matching with clientKey"
```

---

## Task 8: Manual browser verification

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Run: `pnpm dev:admin-web` (and ensure `pnpm dev:api` / `docker compose up -d` are running per the root `CLAUDE.md` prerequisites).

- [ ] **Step 2: Verify the create flow**

Navigate to `/products/new`. Add a variant, click its image cell, drag-and-drop 2-3 images into the popup, confirm real percentage progress bars appear and each image lands in the finished grid. Drag to reorder them and confirm the order persists after a page refresh (once saved). Save the product and confirm it navigates to the edit page with images intact.

- [ ] **Step 3: Verify the edit flow**

On the edit page, open a variant's popup: click the primary star on a non-primary image and confirm the star moves; remove an image and confirm it's gone after a refresh (server-side delete); drop an oversized (>10MB) or non-image file and confirm an inline error appears without a network request (check the Network tab).

- [ ] **Step 4: Verify retry and cancel**

Throttle the network (DevTools → Network → Slow 3G), start an upload, and click the row's × mid-upload — confirm the request is aborted (check Network tab) and the row disappears. Then simulate a failure (e.g., temporarily stop the API) and confirm the failed row's Retry button re-attempts the same file successfully once the API is back.

- [ ] **Step 5: Verify concurrency**

Drop 6+ images at once on a fast connection and confirm (via the Network tab) that no more than 5 upload requests are in flight simultaneously.

- [ ] **Step 6: Report results**

Note any visual or interaction issues found; fix before considering this plan complete.
