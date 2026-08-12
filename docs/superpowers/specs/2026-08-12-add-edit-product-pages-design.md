# Add / Edit Product Pages — Design Spec

**Date**: 2026-08-12
**Status**: Approved
**Scope**: Backend `description` column + `POST` multipart refactor; Frontend feature module with shared `ProductForm` for create (`/products/new`) and edit (`/products/:id/edit`) flows.

---

## 1. Backend Changes

### 1.1 Product Entity

Add `description` column to `products` table:

- **Column**: `description text NULL`
- **Entity** (`products.entity.ts`): Add `@Column({ type: 'text', nullable: true }) description: string | null`
- **No RLS changes** — column is on the existing `products` table which already has tenant-scoped RLS policies.

### 1.2 ProductVariant Entity

Add `name` column to `product_variants` table:

- **Column**: `name text NULL`
- **Entity** (`product-variants.entity.ts`): Add `@Column({ type: 'text', nullable: true }) name: string | null`
- The Stitch design shows "Variant Name" in the variants table. The backend currently only has `sku`, `priceCents`, `stock`, `isDefault` — no display name.

### 1.3 Migration

```sql
ALTER TABLE products ADD COLUMN description text;
ALTER TABLE product_variants ADD COLUMN name text;
```

Two nullable column additions. No data backfill needed.

### 1.4 DTO Updates

**`CreateProductDto`**:
- Add `description?: string` — `@IsString()`, `@IsOptional()`, `@MaxLength(5000)`

**`UpdateProductDto`**:
- Add `description?: string` — same decorators

**`CreateVariantDto`**:
- Add `name?: string` — `@IsString()`, `@IsOptional()`, `@MaxLength(255)`

**`UpdateVariantDto`**:
- Add `name?: string` — same decorators

**Response serialization**: Include `description` in all product responses (merchant admin and storefront).

### 1.4 Multipart Create Endpoint

Refactor `POST /merchant-admins/products` to accept `multipart/form-data`:

- **`data` field**: JSON string containing `{ title, description, status, categoryIds, variants[] }`
- **Image files**: Keyed as `variants[<index>].images[<index>]` (e.g. `variants[0].images[0]`, `variants[0].images[1]`)
- **Processing**: Parse JSON `data` field, validate with `CreateProductDto`, then in a single DB transaction:
  1. Create `Product` record
  2. Create `ProductVariant` records (with auto-default if needed)
  3. Process uploaded image files → store via existing storage provider
  4. Create `ProductVariantImage` records mapped by variant index → created variant ID
- **Response**: Complete product with nested variants and images
- **Atomicity**: If any step fails, the entire transaction rolls back — no orphaned records.
- **Backwards compatibility**: Not required — the endpoint currently has no frontend consumers (products page is a placeholder).

---

## 2. Frontend Architecture

### 2.1 Feature Module Structure

```
src/features/products/
├── components/
│   ├── ProductForm.tsx              # Shared form shell (mode: 'create' | 'edit')
│   ├── GeneralInfoSection.tsx       # Product name + Tiptap description
│   ├── CategoryMultiSelect.tsx      # Searchable dropdown with pill chips
│   ├── VariantsSection.tsx          # Variants table + add/remove logic
│   ├── VariantRow.tsx               # Single variant row (name, SKU, price, stock, images)
│   ├── VariantImageUploader.tsx     # Per-variant image cells (upload, preview, remove)
│   └── OrganizationSidebar.tsx      # Status dropdown (right column)
├── pages/
│   ├── CreateProductPage.tsx        # Container: empty form → POST multipart
│   └── EditProductPage.tsx          # Container: fetch + pre-fill → PATCH
├── schemas/
│   └── product-form.schema.ts      # Zod schema + inferred type
└── index.ts                         # Barrel exports
```

### 2.2 Routing

Added to `src/routes/index.tsx` inside the `RequireAuth` + `AppLayout` group:

| Route | Component |
|---|---|
| `/products/new` | `CreateProductPage` |
| `/products/:id/edit` | `EditProductPage` |

The existing placeholder `ProductsPage` gains an "Add Product" button linking to `/products/new`.

### 2.3 RTK Query Endpoints

| File | Endpoints | Tags |
|---|---|---|
| `productsApi.ts` | `createProduct` (mutation), `getProduct` (query), `updateProduct` (mutation) | `Products` (already registered) |
| `categoriesApi.ts` | `getCategories` (query — hierarchical tree) | `Categories` (add to `baseApi.ts` `tagTypes`) |
| `productVariantImagesApi.ts` | `uploadVariantImage` (mutation), `deleteVariantImage` (mutation) | `Products` (invalidate on image change) |

---

## 3. Form Component Design

### 3.1 ProductForm Interface

```tsx
interface ProductFormProps {
  mode: 'create' | 'edit';
  initialData?: ProductFormData;
  onSubmit: (data: ProductFormData, localImages: Map<number, File[]>) => Promise<void>;
  isSubmitting: boolean;
}
```

### 3.2 Zod Schema

```ts
const variantSchema = z.object({
  id: z.string().uuid().optional(),           // Present only in edit mode
  name: z.string().min(1, 'Variant name is required'),
  sku: z.string().min(1, 'SKU is required').max(100),
  priceCents: z.coerce.number().int().min(0, 'Price must be ≥ 0'),
  stock: z.coerce.number().int().min(0, 'Stock must be ≥ 0'),
  isDefault: z.boolean().default(false),
});

const productFormSchema = z.object({
  title: z.string().min(1, 'Product name is required'),
  description: z.string().optional().default(''),
  status: z.enum(['draft', 'active', 'archived']),
  categoryIds: z.array(z.string().uuid()).default([]),
  variants: z.array(variantSchema).min(1, 'At least one variant is required'),
});
```

### 3.3 Component Responsibilities

| Component | Details |
|---|---|
| **`GeneralInfoSection`** | Product Name via shadcn `<Input>`. Description via Tiptap editor (bold, italic, lists, links toolbar). Category via `<CategoryMultiSelect>`. All wired to `react-hook-form` via `<FormField>`. |
| **`CategoryMultiSelect`** | Fetches categories via `useGetCategoriesQuery()`. Renders shadcn `<Popover>` + `<Command>` for searchable dropdown. Flattens hierarchical tree for selection. Selected categories shown as removable `<Badge>` pill chips. Outputs `categoryIds: string[]`. |
| **`VariantsSection`** | Uses `useFieldArray({ name: 'variants' })` for dynamic rows. Renders shadcn `<Table>` with columns: Image, Variant Name, SKU, Price ($), Stock, Delete. "+ Add Variant" button appends a row with sensible defaults. Last variant's delete button is disabled (minimum one variant required). |
| **`VariantRow`** | Single table row. Each cell is an `<Input>` registered with `react-hook-form`. Delete button removes the row from the field array. |
| **`VariantImageUploader`** | Shows existing image thumbnails + dashed "add" button. In edit mode: uploads immediately via `uploadVariantImage` mutation, deletes immediately via `deleteVariantImage`. In create mode: queues `File` objects locally in a `Map<variantIndex, File[]>` managed by the parent form — these are sent as part of the multipart `FormData` on submit. Uses native `<input type="file" accept="image/*">` and `URL.createObjectURL()` for local previews. |
| **`OrganizationSidebar`** | Status dropdown via shadcn `<Select>` with options: Draft, Active, Archived. |

### 3.4 Price Handling

The form displays price in **dollars** (e.g. `12.99`). Conversion:
- **On load (edit)**: `priceCents / 100` → display value
- **On submit**: `Math.round(displayValue * 100)` → `priceCents` (integer)

The `z.coerce.number()` handles string→number from the input. A transform layer at the form boundary handles dollars↔cents conversion.

### 3.5 Layout

Matches the Stitch design — 2-column grid:
- **Left column (lg:col-span-2)**: General Information card → Variants card
- **Right column (lg:col-span-1)**: Organization card
- **Top**: Breadcrumbs (`Products > Add New Product`) + action buttons (Discard, Save Product)

---

## 4. Data Flow

### 4.1 Create Flow

```
1. User fills form, attaches images per variant
2. User clicks "Save Product"
3. Frontend builds FormData:
     formData.append('data', JSON.stringify({ title, description, status, categoryIds, variants }))
     formData.append('variants[0].images[0]', file1)
     formData.append('variants[0].images[1]', file2)
     ...
4. POST /merchant-admins/products  (multipart/form-data)
5. Backend: single transaction → product + variants + images
6. On success → navigate to /products/:id/edit with success toast
7. On failure → show error banner above form, user can retry
```

### 4.2 Edit Flow

```
1. GET /merchant-admins/products/:id → populate form
2. User edits fields
3. Image uploads/deletes happen immediately via dedicated endpoints
4. User clicks "Save Product"
5. PATCH /merchant-admins/products/:id → title, description, status, categoryIds, variants diff
6. On success → stay on page with success toast, invalidate RTK Query cache
7. On failure → show error banner
```

### 4.3 Variant Diffing in Edit Mode

The `PATCH` endpoint accepts variants with optional `id`:
- Variants **with** `id` → updated
- Variants **without** `id` → created
- Variants **missing** from the array → deleted

The form tracks variant IDs from `initialData` so the diff is correct.

### 4.4 Discard & Dirty Detection

- **Pristine form**: "Discard" navigates to `/products` immediately
- **Dirty form**: Browser `beforeunload` prompt (no custom modal)

### 4.5 Error Handling

All API errors processed through `extractErrorMessage()` and displayed as a top-level alert banner above the form, consistent with the auth feature pattern. Field-level validation is Zod-only (client-side).

---

## 5. New Dependencies

### 5.1 npm Packages (added to `apps/admin-web`)

| Package | Purpose |
|---|---|
| `@tiptap/react` | React bindings for Tiptap editor |
| `@tiptap/starter-kit` | Core extensions (bold, italic, lists, etc.) |
| `@tiptap/extension-link` | Link extension for the description toolbar |

### 5.2 shadcn Components to Install

| Component | Used by |
|---|---|
| `select` | Status dropdown (OrganizationSidebar) |
| `table` | Variants table (VariantsSection) |
| `popover` | Category multi-select dropdown |
| `command` | Searchable list inside category popover |
| `separator` | Visual dividers |
| `sonner` (toast) | Success/error feedback after save |
| `breadcrumb` | Page header navigation |

### 5.3 Existing Components Reused

`badge`, `button`, `card`, `input`, `form`, `label` — all already installed.

---

## 6. Design Reference

The Stitch-generated screenshot and HTML are stored at:
- Screenshot: `stitch-assets/add-product-categories-screenshot.jpg` (in conversation artifacts)
- HTML: `stitch-assets/add-product-categories.html` (in conversation artifacts)

The implementation should match the visual design, color palette, spacing, and typography from the Stitch reference while using the project's existing Tailwind v4 + shadcn/ui component system.
