# CLAUDE.md — Admin Web Application (`apps/admin-web`)

This file provides guidance to Claude Code (claude.ai/code) when working with code in `apps/admin-web`.

---

## 1. Overview

**`apps/admin-web`** is the React SPA frontend application for merchant administration in the **Tiny Threads** multi-tenant marketplace platform. It allows merchants to manage products, categories, orders, and store settings.

**Read `.claude/skills/frontend-engineer/SKILL.md` before touching any admin-web code** — it is the operating manual for this app's conventions (feature-based architecture, the Redux-free vs. "smart" component split, forms/validation, testing) that this file summarizes.

---

## 2. Tech Stack

- **Framework & Build Tool**: React 19, Vite, TypeScript
- **State Management**: Redux Toolkit (`@reduxjs/toolkit`, `react-redux`), RTK Query for API data (`src/store/api/`)
- **Routing**: `react-router-dom`
- **Forms & Validation**: `react-hook-form`, `zod`, `@hookform/resolvers` (`zodResolver`)
- **Internationalization**: `react-i18next`, `i18next`
- **Styling & UI**: Tailwind CSS v4 (`@tailwindcss/vite`), shadcn/ui, Lucide icons (`lucide-react`)
- **Shared Dependencies**: `@tiny-threads/shared` (error-envelope types, common schemas)
- **Testing**: Vitest (`vitest run`), Testing Library (`@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`), jsdom
- **Tooling**: ESLint, Prettier

---

## 3. Project Structure

```sh
apps/admin-web/
├── src/
│   ├── components/ui/      # Generic shadcn/ui primitives only (button, input, form, card, ... - zero Redux, zero feature-specific logic)
│   ├── features/           # Feature-based modules (e.g. auth/, common/); each may contain components/, pages/, schemas/, index.ts barrel
│   ├── pages/              # Route-level container pages not (yet) migrated into features/ (dashboard, orders, products, settings, not-found)
│   ├── layouts/             # Route layout shells (AppLayout, AuthLayout)
│   ├── routes/              # Router config + route guards (routes/guards/)
│   ├── store/               # Redux store setup & hooks (src/store/index.ts, hooks.ts), slices (store/slices/), RTK Query API (store/api/, store/api/endpoints/)
│   ├── i18n/                # react-i18next setup + locale resources (i18n/locales/<lang>/)
│   ├── theme/               # Theme definitions & DOM application
│   ├── lib/                 # API client, generic utilities, error-message extraction
│   ├── App.tsx              # Main application component & root routes
│   └── main.tsx             # Entry point rendering React DOM
├── index.html               # HTML shell
├── vite.config.ts           # Vite config: Tailwind CSS v4 plugin, Vitest config, path aliases (@components, @features, @i18n, @lib, @store, @theme)
├── components.json          # shadcn/ui configuration
└── package.json             # App dependencies & scripts (@tiny-threads/admin-web)
```

Every source folder pairs with a colocated `__tests__/` directory next to the code it covers (e.g. `features/auth/schemas/__tests__/`, `components/ui/__tests__/`) — tests are never colocated as sibling files.

---

## 4. Development Workflows & Commands

Commands can be run from `apps/admin-web` or root workspace:

```bash
pnpm dev                    # From apps/admin-web
pnpm dev:admin-web          # From root workspace

# Build for production
pnpm build                  # Runs tsc build & Vite bundle

# Code quality & linting
pnpm lint                   # Run ESLint
```

---

## 5. Coding Conventions & Best Practices

1. **Centralized Redux Store (`src/store/`)**: All Redux Toolkit slices (`src/store/slices/`), RTK Query API definitions (`src/store/api/`), typed hooks (`src/store/hooks.ts`), and store configuration (`src/store/index.ts`) MUST reside strictly inside `src/store/`. Do not create Redux slices inside component or feature directories.
2. **Pure Presentational Primitives (`src/components/ui/`)**: Generic shadcn/ui primitives MUST BE pure presentational components with **ZERO Redux imports**. They receive all data via props and emit events via callback functions so they can be rendered and tested cleanly without requiring a Redux Provider wrapper.
3. **Feature-Based Modules (`src/features/`)**: Group a domain area's `components/`, `pages/`, and `schemas/` together under `src/features/<feature>/` with a barrel `index.ts`. Prefer this structure for new domain areas over adding to the flat `src/pages/`/`src/components/` — the existing flat pages (dashboard, orders, products, settings) are legacy and not a pattern to copy for new work. Unlike `components/ui/`, feature components in `src/features/<feature>/components/` MAY be "smart" — they can call `useAppSelector`/`useAppDispatch` and RTK Query hooks directly (e.g. `LoginForm`, `LocaleSelector`, `ThemeSelector`) rather than only receiving data via props from a container page.
4. **Smart Container Pages**: Container pages — whether in `src/pages/` or a feature's `src/features/<feature>/pages/` — connect Redux state (`useAppSelector`) and actions (`useAppDispatch`), handle async side effects/API calls, and pass props down to presentational components. This container/presentational split is strict for the legacy `src/pages/` + `src/components/` pairing; feature modules relax it per item 3 above.
5. **UI & Styling**: Use Tailwind CSS v4 classes and existing shadcn/ui components (`src/components/ui`). Do not inject inline hardcoded CSS styles.
6. **Forms & Validation**: Define a Zod schema per form in `src/features/<feature>/schemas/<name>.schema.ts` (with a barrel `index.ts`), and derive the form data type via `z.infer<typeof schema>` rather than a hand-written interface. Zod validation messages are plain hardcoded strings in the schema file (schemas are defined outside React/i18n context) — translate them at render time only if a future requirement demands it. Wire the form up with `useForm({ resolver: zodResolver(schema) })` and build it using the shared shadcn primitives in `src/components/ui/form.tsx` (`Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`). Set `noValidate` on the `<form>` element so Zod is the only validation path. Keep server/API errors (e.g. coded auth failures) in a top-level error state/banner via `extractErrorMessage` — do not conflate them with Zod field errors.
7. **Shared Types**: Import shared API error contracts and error codes directly from `@tiny-threads/shared`.
8. **API Integration**: Handle API errors using the standard coded error response format `{ error: { code, message, params, fields } }` provided by `@tiny-threads/api`.
9. **Testing**: Tests run via Vitest (`pnpm test`), colocated under a `__tests__/` directory next to the code they cover, using Testing Library + `userEvent`. Assert on rendered output (validation messages, roles, text) rather than implementation details.
10. **Component Design**: Keep components small, modular, and single-purpose. Separate presentation components from state/data fetching logic.
11. **Internationalization**: All user-facing text MUST go through `react-i18next`'s `t()` function — no hardcoded English strings in JSX, props, toasts, or error messages. Keys are dot-namespaced by domain (e.g., `t('products.pageTitle')`). Resources are in `src/i18n/locales/en/common.json`. Exception: Zod schema validation messages remain hardcoded plain strings (schemas run outside React context).

---

## 6. Essential References

- **Frontend Operating Manual**: `.claude/skills/frontend-engineer/SKILL.md`
