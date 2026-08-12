# Product UI Fixes — Design Spec

**Date:** 2026-08-13
**Scope:** `apps/admin-web` — Breadcrumbs, Card borders, TipTap rich text editor

---

## 1. Problem Statement

Four UI issues in the admin-web product pages:

1. **Breadcrumbs cause full page reloads** — `BreadcrumbLink` uses plain `<a>` tags with `href` instead of React Router's `<Link>`, triggering full navigation on click.
2. **Card borders are too dark** — The global `--border` variable (`#c7c4d8` light / `#464554` dark) produces heavy borders that feel dated rather than premium.
3. **TipTap editor content styles are broken** — The editor applies `prose prose-sm` Tailwind classes but `@tailwindcss/typography` is not installed, so bullet lists, numbered lists, links, and headings render unstyled.
4. **Link editing UX is primitive** — Links use `window.prompt()` with no way to edit display text, update existing links, or remove links from text. No ordered list button exists in the toolbar.

---

## 2. Fix 1: Breadcrumb Router Links

### What changes

In `ProductForm.tsx` (and any other breadcrumb usage sites), replace:

```tsx
<BreadcrumbLink href="/products">Products</BreadcrumbLink>
```

with:

```tsx
<BreadcrumbLink asChild>
  <Link to="/products">Products</Link>
</BreadcrumbLink>
```

### Files affected

| File | Change |
|---|---|
| `features/products/components/ProductForm.tsx` | Use `asChild` + React Router `Link` |
| Any other files using `BreadcrumbLink` with `href` | Same pattern |

### No changes needed

- `components/ui/breadcrumb.tsx` — already supports `asChild` via Radix `Slot`.

---

## 3. Fix 2: Lighter Card Borders

### Theme variable changes in `src/index.css`

| Variable | Current | New |
|---|---|---|
| Light `--border` | `#c7c4d8` | `#e2e0ed` |
| Dark `--border` | `#464554` | `#2a2a38` |

### Card component change in `src/components/ui/card.tsx`

- Default class: `shadow` → `shadow-sm` (softer elevation to complement lighter borders).

### Impact

The `--border` variable is used globally by cards, inputs, and dividers. The lighter value creates a cohesive, premium feel. Input borders still feel responsive due to focus ring (`--ring`) on interaction.

---

## 4. Fix 3: TipTap Editor Styling & Ordered List

### 4a. Install `@tailwindcss/typography`

```bash
pnpm --filter @tiny-threads/admin-web add -D @tailwindcss/typography
```

The editor already applies `prose prose-sm max-w-none` on the content area. Once the plugin is installed, these classes activate and provide:

- Disc markers on `<ul>` items
- Decimal numbers on `<ol>` items
- Colored, underlined links
- Proper heading/paragraph spacing

If any prose defaults clash with the theme (e.g., link color), override with `prose-a:text-primary prose-a:no-underline` or similar modifiers on the editor class string.

### 4b. Add ordered list toolbar button

- Import `ListOrdered` from `lucide-react`
- Place the button immediately after the existing bullet list button
- Calls `editor.chain().focus().toggleOrderedList().run()`
- Active state: `editor.isActive('orderedList')` (same highlight pattern as other toolbar buttons)

---

## 5. Fix 4: Inline Link Popper & Bubble Menu

### 5a. Component relocation

Move `RichTextEditor` from `features/products/components/` to a shared UI location since it's a pure presentational primitive with no Redux dependencies:

```
src/components/ui/rich-text-editor/
├── RichTextEditor.tsx          ← moved from features/products/
├── LinkPopover.tsx             ← new
├── LinkBubbleMenu.tsx          ← new
├── index.ts                   ← barrel export
└── __tests__/
    └── RichTextEditor.test.tsx ← moved from features/products/
```

Update imports in `features/products/components/GeneralInfoSection.tsx` to:

```tsx
import { RichTextEditor } from '@components/ui/rich-text-editor';
```

### 5b. `LinkPopover` component

A floating panel using Radix `Popover` (via shadcn/ui), anchored to the toolbar link button.

**Fields:**
- **URL** — text input, required, placeholder `https://...`
- **Display text** — text input, optional. Pre-fills with currently selected text. If left empty, uses URL as display text.

**Actions:**
- **Apply** — sets/updates the link on selected text
- **Remove link** — unsets the link, preserves text (only shown when editing an existing link)
- **Cancel** — closes without changes, restores editor focus

**Open behavior:**
- Cursor on existing link → pre-fills URL and display text, shows "Remove link"
- Text selected but not a link → pre-fills display text from selection, URL empty
- Nothing selected → both fields empty

**Props:** Receives the TipTap `editor` instance. Manages its own open/closed state via `useState`.

### 5c. `LinkBubbleMenu` component

Uses TipTap's `BubbleMenu` — a floating element that appears when clicking on or selecting linked text.

**Content:**
- Truncated link URL as a clickable preview (opens in new tab)
- **Edit** button — opens `LinkPopover` pre-filled with current link data
- **Unlink** button — removes link, keeps text

**Visibility:** Only shows when `editor.isActive('link')`. Positioning handled automatically by TipTap's `BubbleMenu`.

**Props:** Receives the TipTap `editor` instance.

### 5d. Edge cases

| Scenario | Behavior |
|---|---|
| Empty selection + display text provided | Insert display text as new linked text at cursor |
| Bare domain entered (e.g., `example.com`) | Auto-prepend `https://` |
| Escape key | Close popover/bubble without applying |
| Click outside | Close popover without applying |
| Link with no display text change | Only update the `href`, preserve existing text |

### 5e. Data flow

- Both `LinkPopover` and `LinkBubbleMenu` receive the `editor` instance as a prop
- They call `editor.chain().focus().setLink()` / `unsetLink()` directly
- No Redux or external state — local `useState` for form fields and open/closed state
- The popover manages its own open state; bubble menu visibility is driven by TipTap's selection detection

---

## 6. Files Changed Summary

| File | Type | Description |
|---|---|---|
| `package.json` | Modified | Add `@tailwindcss/typography` dev dependency |
| `src/index.css` | Modified | Lighten `--border` values (light + dark) |
| `src/components/ui/card.tsx` | Modified | `shadow` → `shadow-sm` |
| `src/components/ui/rich-text-editor/RichTextEditor.tsx` | Moved + Modified | Relocated; add ordered list button, replace `window.prompt` with `LinkPopover` |
| `src/components/ui/rich-text-editor/LinkPopover.tsx` | New | Inline link editing popover |
| `src/components/ui/rich-text-editor/LinkBubbleMenu.tsx` | New | Floating bubble menu for existing links |
| `src/components/ui/rich-text-editor/index.ts` | New | Barrel export |
| `src/components/ui/rich-text-editor/__tests__/RichTextEditor.test.tsx` | Moved | Relocated test |
| `src/features/products/components/GeneralInfoSection.tsx` | Modified | Update import path |
| `src/features/products/components/ProductForm.tsx` | Modified | Use `asChild` + React Router `Link` in breadcrumb |
| `src/features/products/index.ts` | Modified | Remove `RichTextEditor` export |

---

## 7. Out of Scope

- Adding more TipTap extensions (headings, code blocks, blockquotes are already disabled by intent)
- Redesigning the full toolbar (only adding ordered list + fixing link)
- Image upload or media embedding in the editor
- Changes to the `BreadcrumbLink` primitive component
