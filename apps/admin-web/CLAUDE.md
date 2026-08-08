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
│   ├── components/         # Reusable UI components (shadcn/ui & custom layout components)
│   ├── features/           # Feature modules (auth, products, categories, orders, settings)
│   ├── store/              # Redux Toolkit store setup & root slices
│   ├── lib/                # API client, utilities, and helpers
│   ├── App.tsx             # Main application component & routes
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
# Run Vite development server
pnpm dev                    # From apps/admin-web
pnpm dev:admin-web          # From root workspace

# Build for production
pnpm build                  # Runs tsc build & Vite bundle

# Code quality & linting
pnpm lint                   # Run ESLint
```

---

## 5. Coding Conventions & Best Practices

1. **State Management**: Use Redux Toolkit for global/cross-component application state and API caching. Keep local component state in React standard hooks (`useState`, `useReducer`).
2. **UI & Styling**: Use Tailwind CSS v4 classes and existing shadcn/ui components (`src/components/ui`). Do not inject inline hardcoded CSS styles.
3. **Shared Types**: Import shared API error contracts and error codes directly from `@tiny-threads/shared`.
4. **API Integration**: Handle API errors using the standard coded error response format `{ error: { code, message, params, fields } }` provided by `@tiny-threads/api`.
5. **Component Design**: Keep components small, modular, and single-purpose. Separate presentation components from state/data fetching logic where appropriate.
