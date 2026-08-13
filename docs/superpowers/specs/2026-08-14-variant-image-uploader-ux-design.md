# Variant Image Uploader UX — Design Spec

**Date**: 2026-08-14
**Status**: Approved
**Scope**: Backend `clientKey` correlation field (DTO + service only, no migration); Frontend redesign of `apps/admin-web` product-variant image uploader (new components, shared upload manager, three new dependencies).

---

## 1. Problem Statement

Image uploading for product variants (`apps/admin-web/src/features/products/components/VariantImageUploader.tsx`) has thin UX and a fragile implementation:

- No progress indicator, no per-image error surfacing (mutation errors are never read), no retry, no drag-and-drop, no reordering UI — despite the backend already supporting list/patch/reorder endpoints that the frontend never calls.
- The component juggles two different upload timings (immediate upload vs. locally-queued-until-save) branched on `mode`/`variantId`, which produced three recent bug-fix commits: a race condition matching newly-created variants to queued images by SKU, an object-URL memory leak, and a storage URL construction bug.
- New-variant correlation relies on matching by `sku` in the create/update response, which is a mutable, user-editable business field never designed as an identity token — it is a workaround for the response's variant order not matching request order.

This spec redesigns the uploader's UX and unifies its underlying data model, fixing the SKU-matching root cause along the way.

## 2. Non-Goals

- Avatar/profile-picture upload UI (explicitly out of scope per the backend design; a separate follow-up).
- Presigned/direct-to-storage upload (uploads continue to route through the API server as multipart, per the existing `StoragePort` architecture).
- Any change to image processing (`sharp` re-encoding to WebP, 2048×2048 bound) — unchanged.

---

## 3. Backend Change: `clientKey` Correlation Field

**Root cause**: `products.service.ts`'s `create`/`createWithImages`/`update` all build their response via `findProductById` (`products.service.ts:72-100`), which orders nested `images` but not `variants` — response variant order is DB-derived, not input-order-preserving. Existing variants can be matched by `id`; newly-submitted variants have no `id` yet, so the frontend falls back to matching by `sku`.

**Fix**: add an optional, request-only correlation token.

- `CreateVariantDto` (`create-product.dto.ts`) and `UpdateVariantDto` (`update-product.dto.ts`): add `clientKey?: string` (`@IsOptional()`, `@IsString()`, `@MaxLength(64)`). **Not added to the `ProductVariant` entity — no migration.**
- `products.service.ts`: the `create`/`createWithImages`/`update` methods already build an in-memory, submission-order-preserving array when saving variants (`createVariantsForProduct`, lines 102-162; the update loop, lines 509-563) — the same mechanism `createWithImages` already uses internally for index-based image matching (lines 294-296). After save, build a `Map<variantId, clientKey>` from that in-order array (only for entries that had a `clientKey` in the request), then attach `clientKey` onto the matching variant object in the final `findProductById` response before it serializes. No new serializer layer needed — controllers already return raw entities directly, and attaching a transient, non-persisted property is sufficient.
- Frontend: every variant row gets a `clientKey` (`crypto.randomUUID()`) generated once when the row is created in local form state, kept for the row's lifetime, and always sent on create/update. The upload manager (§5) resolves `clientKey → real variantId` from the response, replacing SKU-based matching entirely.

## 4. Backend Change: Wiring Existing Endpoints

No new backend endpoints — the frontend starts consuming what already exists:

- `GET /merchant-admins/products/:productId/variants/:variantId/images` — hydrate a variant's persisted image list.
- `PUT /merchant-admins/products/:productId/variants/:variantId/images/reorder` — body `{ imageIds: string[] }`, called after a drag-reorder in the popup.
- `PATCH .../images/:imageId` — called when the merchant clicks the primary star.

---

## 5. Frontend Architecture & Data Flow

### 5.1 Unified upload model

Replace the current create/edit branching with one model: every image for a variant — whether just selected or already persisted — lives in a single ordered list of items with a status: `queued → uploading → done | error`.

- **`useVariantImageManager`** — one hook instance owned by `ProductForm` (not per-popup), holding:
  - Per-variant item lists, keyed by `clientKey`.
  - A **global** concurrency queue capped at 5 in-flight uploads (via `p-limit`), global rather than per-variant because saving a product with several new variants gives them all real IDs simultaneously, and their queued files all become uploadable at once — a global cap prevents that burst from exceeding 5 concurrent requests.
  - The upload/delete/list/reorder/patch mutations.
- Files selected/dropped for a variant without a real `variantId` yet (create mode, or a new row in edit mode) sit in `queued` state until the parent product/variant save resolves and the manager can resolve their `clientKey` to a real `variantId`; at that point they enter the same concurrency-limited queue as any other upload — there is no longer a separate "immediate" code path.
- Reordering/primary-selection use a single client-side ordered list interleaving not-yet-uploaded and persisted images. Dragging a persisted image calls the reorder endpoint immediately with the persisted image IDs only (in their new relative order, skipping any interleaved not-yet-uploaded items) — optimistic, rolled back on failure. Dragging a not-yet-uploaded item is purely local state, folded into its eventual upload.

### 5.2 Components

Replacing the current single `VariantImageUploader`:

- **`VariantImageCell`** — the collapsed table-row view (approved mockup: `collapsed-plus-popup.html`). Shows only the primary image (or a dashed "+" placeholder if empty); hovering when the variant has more than one image overlays a "+N" badge. Clicking it (any state) opens the popup for that variant.
- **`VariantImagePopup`** (Radix `Dialog`, already a dependency) — approved mockup: `popup-v3.html`.
  - A `react-dropzone` area at top ("Drag & drop images here or click to browse"), enforcing the same `accept`/`maxSize` as the server (see §6).
  - An "Uploading (N)" section: a height-capped, scrollable list (`max-height` + `overflow-y: auto`). Each row: thumbnail, filename, a real percentage progress bar (see §5.3) or a failed state with inline **Retry**, and — on every row regardless of status — a **×** control (semantics in §6).
  - A divider, then the finished-images grid: `@dnd-kit/core` + `@dnd-kit/sortable` for drag-to-reorder, a primary star toggle, and a per-tile delete.
- Both components are presentational — they read/dispatch through `useVariantImageManager`, so opening a second variant's popup doesn't pause the first variant's in-flight uploads; they keep progressing in the background against the shared global queue.

### 5.3 Real upload progress

`fetchBaseQuery` (the shared `baseApi`, `apps/admin-web/src/store/api/baseApi.ts`) uses native `fetch`, which exposes no upload-progress events. Rather than build custom XHR plumbing, the `uploadVariantImage` mutation switches to a per-endpoint `queryFn` (RTK Query's documented escape hatch for a mutation needing custom request logic) using **`axios`**, whose `onUploadProgress` callback drives the row's percentage. This is scoped to the upload mutation only — every other endpoint keeps the existing `fetchBaseQuery` + 401-refresh-retry wrapper untouched.

### 5.4 New dependencies (`apps/admin-web/package.json`)

| Package | Purpose |
|---|---|
| `@dnd-kit/core`, `@dnd-kit/sortable` | Drag-to-reorder grid in the popup — actively maintained, accessible (keyboard reordering), unlike unmaintained `react-beautiful-dnd`. |
| `react-dropzone` | Dropzone drag-over states, file-type/multi-file handling, rejection reasons — the de facto standard for this widget. |
| `p-limit` | Caps the global upload queue at 5 concurrent requests. |
| `axios` | `onUploadProgress` for real per-file percentage (native `fetch` has no equivalent). |

---

## 6. Error Handling & Validation

- **Client-side validation** (via `react-dropzone`'s `accept`/`maxSize`) mirrors the server: reject files over 10MB or outside `jpeg/png/webp/avif` immediately in the browser — shown as an inline error row, no network call made.
- **Server-side validation** remains authoritative (`sharp` inspects actual file bytes/magic numbers in `image-processing.service.ts`). Its error codes (`INVALID_FILE_TYPE`, `FILE_TOO_LARGE`, `IMAGE_PROCESSING_FAILED`) route through the existing `extractErrorMessage` helper to a friendly per-row message.
- **Retry** re-runs the same file through the same upload path, flipping the row back to `uploading`.
- **Remove (×)** — behavior depends on row status:
  - `queued` / `uploading` → abort the in-flight request (axios cancel token) and drop the row locally; no server call.
  - `error` → drop the row locally; it never reached the server.
  - `done` → call `deleteVariantImage` (optimistic removal, rolled back with a toast on failure) — this is a real server-side delete, since the underlying image already exists.
- **Partial success**: the product/variant save always completes independently of image upload outcomes. Any image left in `error` after the save flow settles keeps its own inline Retry; if one or more remain failed, a single Sonner toast (already a dependency) summarizes "N image(s) failed to upload."
- **Primary auto-promotion**: the backend already promotes a new primary image on delete (existing behavior, no change). The frontend needs no special handling — the `Products` cache tag invalidation (already wired on delete) refetches and reflects whichever image the backend picked.

---

## 7. Testing Plan

- **Frontend unit tests** (Vitest + Testing Library, `__tests__` dirs per repo convention):
  - `useVariantImageManager`: `queued → uploading → done/error` transitions, the 5-concurrent cap, `clientKey` resolution after a create/update response.
  - `VariantImageCell`: primary-image display, hover "+N" badge logic, click-opens-popup.
  - `VariantImagePopup`: dropzone accept/reject, scrollable queue rendering, retry/remove wiring, drag-reorder triggering the reorder mutation, primary-star triggering the patch mutation.
- **Backend unit tests** (Jest): `clientKey` echoed back correctly per new variant on create/update; existing variants unaffected; `clientKey` never persisted to the `product_variants` row.
- **Backend e2e**: extend existing multipart-create e2e coverage to assert the `clientKey` round-trip. Reorder-endpoint ordering behavior is already covered by the original image-upload design's e2e suite.
- **Manual browser check**: run `pnpm dev:admin-web` and exercise drag-and-drop, real progress bars, retry, cancel, and drag-reorder in an actual browser before calling the feature complete.

---

## 8. Open Risks

- `axios` is a new runtime dependency solely for upload-progress events; if bundle size becomes a concern later, this is the one component-specific place it's used, so it could be swapped for a hand-rolled `XMLHttpRequest` wrapper without touching the rest of the design.
- Global (not per-variant) concurrency capping means a product with many variants, each with several new images, shares one 5-slot queue — a merchant bulk-adding images across many variants at once will see later variants' images queue longer. This was an explicit trade-off (see §5.1) to avoid bursting past 5 concurrent requests to the API.
