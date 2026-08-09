# Admin Web Theme Integration Design Spec

## Overview
This specification details the architecture for integrating the design tokens defined in [`docs/DESIGN.md`](file:///Users/nabilnms/Projects/tiny-threads/docs/DESIGN.md) into `apps/admin-web`.

The theme implementation leverages **Tailwind CSS v4**'s `@theme` directive alongside CSS Custom Properties to provide dual theme support (Light and Dark modes) while retaining full compatibility with shadcn/ui components.

---

## Technical Architecture & Token Mapping

### 1. Typography & Web Fonts
`apps/admin-web/index.html` will load Google Fonts for the requested font families:
- **Plus Jakarta Sans** (Light Headline & KPI tokens)
- **Hanken Grotesk** (Dark Headline tokens)
- **Inter** (Body text & Light UI labels)
- **JetBrains Mono** (Dark Label Caps & Monospace code)

### 2. CSS Custom Properties (`apps/admin-web/src/index.css`)
CSS custom properties will be declared under `:root` (Light mode defaults) and `.dark` (Dark mode overrides).

#### Light Mode Defaults (`:root`)
- Map all `colors.light` tokens from `docs/DESIGN.md` to CSS variables (e.g., `--color-surface`, `--color-primary`, `--color-success`, etc.).
- Alias core shadcn CSS variables to point to token variables:
  - `--background`: var(--color-surface)
  - `--foreground`: var(--color-on-surface)
  - `--card`: var(--color-surface-container-lowest)
  - `--card-foreground`: var(--color-on-surface)
  - `--popover`: var(--color-surface-container-lowest)
  - `--popover-foreground`: var(--color-on-surface)
  - `--primary`: var(--color-primary)
  - `--primary-foreground`: var(--color-on-primary)
  - `--secondary`: var(--color-secondary)
  - `--secondary-foreground`: var(--color-on-secondary)
  - `--muted`: var(--color-surface-container)
  - `--muted-foreground`: var(--color-on-surface-variant)
  - `--accent`: var(--color-surface-container-high)
  - `--accent-foreground`: var(--color-on-surface)
  - `--destructive`: var(--color-error)
  - `--destructive-foreground`: var(--color-on-error)
  - `--border`: var(--color-outline-variant)
  - `--input`: var(--color-outline-variant)
  - `--ring`: var(--color-surface-tint)
  - `--radius`: 0.375rem

#### Dark Mode Overrides (`.dark`)
- Map all `colors.dark` tokens from `docs/DESIGN.md` to the corresponding CSS variables under `.dark`.

### 3. Tailwind CSS v4 `@theme` Configuration
In `apps/admin-web/src/index.css`, `@theme` will expose custom token themes:
- **Color Utilities**: `bg-surface`, `bg-surface-container`, `text-on-surface`, `bg-primary`, `bg-success`, `bg-warning`, `bg-error`, `bg-info`, etc.
- **Font Family Utilities**: `font-sans` (Inter), `font-headline` (Plus Jakarta Sans / Hanken Grotesk), `font-mono` (JetBrains Mono).
- **Border Radius Utilities**: `rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-full`.
- **Spacing Scale Utilities**: `p-gutter`, `m-margin-desktop`, `gap-md`, `p-lg`, etc.

---

## Verification Plan

### Automated Verification
- Run `pnpm --filter @tiny-threads/admin-web build` to verify TypeScript compilation and Vite build without syntax or CSS errors.
- Run `pnpm lint` to ensure no linting regressions.

### Manual & Visual Verification
- Verify fonts load cleanly from Google Fonts in `apps/admin-web`.
- Verify light mode renders with the updated color palette and surface contrast.
- Toggle `.dark` class on root HTML element and verify dark mode palette updates seamlessly.
