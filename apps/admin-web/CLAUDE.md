# CLAUDE.md — Admin Web Application (`apps/admin-web`)

This file provides guidance to Claude Code (claude.ai/code) when working with code in `apps/admin-web`.

---

## 1. Overview

**`apps/admin-web`** is the React SPA frontend application for merchant administration in the **Tiny Threads** multi-tenant marketplace platform. It allows merchants to manage products, categories, orders, and store settings.

---

## 2. Tech Stack

- **Framework & Build Tool**: React 19, Vite, TypeScript
- **State Management**: Redux Toolkit (`@reduxjs/toolkit`, `react-redux`)
- **Styling & UI**: Tailwind CSS v4 (`@tailwindcss/vite`), shadcn/ui, Lucide icons (`lucide-react`)
- **Shared Dependencies**: `@tiny-threads/shared` (error-envelope types, common schemas)
- **Tooling**: ESLint, Prettier

---

## 3. Project Structure

```sh
apps/admin-web/
├── src/
│   ├── components/         # Pure presentational UI components (shadcn/ui & domain components - zero Redux dependencies)
│   ├── pages/              # Smart container page components (connect Redux state/dispatch to presentational UI)
│   ├── store/              # Centralized Redux store setup, hooks, and slices (src/store/slices/)
│   ├── lib/                # API client, utilities, and helpers
│   ├── App.tsx             # Main application component & root routes
│   └── main.tsx            # Entry point rendering React DOM
├── index.html              # HTML shell
├── vite.config.ts          # Vite configuration with Tailwind CSS v4 integration
├── components.json         # shadcn/ui configuration
└── package.json            # App dependencies & scripts (@tiny-threads/admin-web)
```

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

1. **Centralized Redux Store (`src/store/`)**: All Redux Toolkit slices (`src/store/slices/`), typed hooks (`src/store/hooks.ts`), and store configuration (`src/store/index.ts`) MUST reside strictly inside `src/store/`. Do not create Redux slices inside component or feature directories.
2. **Pure Presentational Components (`src/components/`)**: All UI components inside `src/components/` (both `ui/` primitives and domain component folders like `components/auth/`) MUST BE pure presentational components with **ZERO Redux imports**. They must receive all data via props and emit events via callback functions so they can be rendered and tested cleanly in Storybook and Jest without requiring Redux Provider wrappers.
3. **Smart Container Pages (`src/pages/`)**: Top-level page components in `src/pages/` act as container components. They connect Redux state (`useAppSelector`) and actions (`useAppDispatch`), handle async side effects/API calls, and pass props down to presentational components in `src/components/`.
4. **UI & Styling**: Use Tailwind CSS v4 classes and existing shadcn/ui components (`src/components/ui`). Do not inject inline hardcoded CSS styles.
5. **Shared Types**: Import shared API error contracts and error codes directly from `@tiny-threads/shared`.
6. **API Integration**: Handle API errors using the standard coded error response format `{ error: { code, message, params, fields } }` provided by `@tiny-threads/api`.
7. **Component Design**: Keep components small, modular, and single-purpose. Separate presentation components from state/data fetching logic.
