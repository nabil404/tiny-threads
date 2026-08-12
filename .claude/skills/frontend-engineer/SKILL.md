---
name: frontend-engineer
description: Frontend engineering conventions for the admin-web merchant dashboard (React 19, Vite, Redux Toolkit, RTK Query, Tailwind v4, shadcn/ui, react-hook-form, zod). Use this skill for ANY work in apps/admin-web — adding a page or route, building or editing a form, wiring Redux state or an RTK Query endpoint, adding a shadcn component, adding a translation string, or writing a component/hook test. Trigger it even when the user doesn't name the architecture explicitly. Getting the presentational/container split, schema colocation, or the Redux-free component rule wrong here produces components that are coupled to Redux and can't be rendered or tested in isolation, so consult this before writing code rather than after.
---

# Frontend Engineer

Frontend conventions for **`apps/admin-web`**, the merchant-administration SPA in the Tiny Threads marketplace. Stack is **React 19 · Vite · TypeScript · Redux Toolkit + RTK Query · Tailwind CSS v4 · shadcn/ui · react-hook-form + zod · react-i18next · Vitest**.

## Platform facts

- **Feature-based architecture, mid-migration.** New domain work goes in `src/features/<feature>/`; a flat legacy layer (`src/pages/`, `src/components/`) still exists for areas not yet migrated (dashboard, orders, products, settings). Don't add new code to the flat layer — extend a feature folder instead.
- **State**: Redux Toolkit for client state, RTK Query for all server data. No other data-fetching layer (no raw `fetch`/`axios` in components).
- **Path aliases** (`vite.config.ts`): `@components`, `@features`, `@i18n`, `@lib`, `@store`, `@theme` — always import through these, never a relative `../../../` chain across top-level folders.
- **Every source folder pairs with a colocated `__tests__/` directory.** Tests are never sibling files (`Foo.test.tsx` next to `Foo.tsx`) — this convention applies repo-wide, not just to `apps/admin-web`.

## Project structure

```sh
src/
├── components/ui/     # Generic shadcn/ui primitives only (button, input, form, card, ...) — zero Redux, zero feature-specific logic
├── features/          # Feature-based modules: <feature>/components, /pages, /schemas, index.ts barrel
├── pages/              # Legacy flat container pages (dashboard, orders, products, settings, not-found) — don't extend this pattern
├── layouts/            # Route layout shells (AppLayout, AuthLayout)
├── routes/             # Router config + route guards (routes/guards/)
├── store/              # Redux store, slices (store/slices/), RTK Query API (store/api/, store/api/endpoints/)
├── i18n/               # react-i18next setup + locale resources (i18n/locales/<lang>/)
├── theme/              # Theme definitions & DOM application
└── lib/                # API client, generic utilities, error-message extraction
```

A feature module owns everything about its domain:

```sh
src/features/auth/
├── components/         # LoginForm.tsx, AuthCard.tsx, ... (+ __tests__/)
├── pages/              # LoginPage.tsx
├── schemas/            # login.schema.ts, index.ts barrel (+ __tests__/)
└── index.ts            # Public exports other code imports through
```

## The non-negotiable invariant: zero Redux in `components/ui/`

**Every component under `components/ui/` must have zero Redux imports** (`useAppSelector`, `useAppDispatch`, RTK Query hooks). These are generic shadcn primitives — they receive data via props and emit events via callbacks only, so they render and test without a Redux `<Provider>` wrapper and stay reusable across features.

`features/<feature>/components/` is a **different rule**: components there MAY be "smart" — calling `useAppSelector`/`useAppDispatch` and RTK Query hooks directly is the established pattern, not an exception. `LoginForm` calls `useLoginMutation()` itself; `LocaleSelector` and `ThemeSelector` call `useAppSelector`/`useAppDispatch`/their mutation hooks themselves. Don't lift these calls to a container page — a feature component owns its own data needs. The legacy `src/pages/` + `src/components/` pairing (dashboard, orders, products, settings) is the one place a strict container/presentational split still applies, and it's not the pattern to copy for new feature work.

## Redux Toolkit & RTK Query

- Slices live only in `src/store/slices/`; RTK Query API definitions only in `src/store/api/` (`store/api/endpoints/<domain>Api.ts`, injected into the single `baseApi` via `injectEndpoints`). Never create a slice or `createApi` instance inside a feature or component directory.
- `store/api/baseApi.ts` centralizes the base query, including 401 → refresh → retry logic (`baseQueryWithReauth`) and cache-reset-on-logout. New endpoints get this for free — don't duplicate 401/refresh handling inside an individual endpoint.
- Add new domains to `baseApi`'s `tagTypes` and invalidate/provide tags for cache correctness rather than manually refetching.

## Forms & validation (react-hook-form + zod + shadcn primitives)

Every form follows the same shape, established by `features/auth/schemas/login.schema.ts` + `features/auth/components/LoginForm.tsx`:

1. **Schema colocated with its feature**: `features/<feature>/schemas/<name>.schema.ts`, re-exported through `schemas/index.ts`, with a test in `schemas/__tests__/<name>.schema.test.ts`.
2. **Derive the type, don't hand-write it**: `export type XFormData = z.infer<typeof xSchema>`.
3. **Validation messages are plain hardcoded strings inside the schema**, not `t()` calls — schemas are defined outside React/i18n context (`z.string().min(1, { message: 'Email is required' })`). Don't try to route them through i18n.
4. **Wire with `zodResolver`**, build the UI from the shared primitives in `src/components/ui/form.tsx` (`Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`), and set `noValidate` on the `<form>` so Zod is the only validation path:

```tsx
const form = useForm<XFormData>({
  resolver: zodResolver(xSchema),
  defaultValues: { ... },
});

<Form {...form}>
  <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
    <FormField
      control={form.control}
      name="email"
      render={({ field }) => (
        <FormItem>
          <FormLabel>{t('auth.emailLabel')}</FormLabel>
          <FormControl>
            <Input type="email" {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  </form>
</Form>
```

5. **Two separate error channels — don't conflate them**: Zod field errors render inline via `FormMessage`. Server/API errors (e.g. a coded `AUTH_INVALID_CREDENTIALS` response) go in a top-level `useState` + banner, extracted with `extractErrorMessage(err, fallbackText)` from `@lib/extract-error-message`. Only reach for `form.setError(fieldName, {...})` when an API error legitimately maps to one specific field.

## Internationalization

All user-facing copy goes through `react-i18next`'s `t()` — no hardcoded English strings in JSX. Keys are namespaced (`t('auth.emailLabel')`, `t('auth.genericError')`); resources live in `src/i18n/locales/<lang>/common.json`. Adding a new string means adding the key to every locale file, not just `en`.

## Testing

- Runner is **Vitest** (`pnpm test` → `vitest run`), environment `jsdom`, with `@testing-library/react` + `@testing-library/user-event` + `@testing-library/jest-dom` (setup in `src/vitest.setup.ts`).
- Tests live in a colocated `__tests__/` directory, never as a sibling file.
- Assert on rendered output — visible text, ARIA roles, validation messages — not implementation details (don't assert on internal state or call counts of things the user can't observe).
- For components that call RTK Query hooks, mock the generated hook directly (`vi.spyOn(authApi, 'useLoginMutation')`), not the network layer.
- For a form: test that an invalid submit shows the Zod validation message(s) and does **not** call the mutation; test that a valid submit calls the mutation with the right payload; test that an API failure renders the error banner (not a field error) via `extractErrorMessage`.

## Related skills

- **`backend-engineer`** — the API side of any feature here: coded error envelope shape (`{ error: { code, message, params, fields } }`), auth flows, and endpoint contracts that `store/api/endpoints/` calls against.

## Pre-merge review checklist

- [ ] New domain code lives in `src/features/<feature>/`, not added to the legacy flat `src/pages/`/`src/components/`.
- [ ] No `useAppSelector`/`useAppDispatch`/RTK Query hook inside anything in `components/ui/` (feature components in `features/*/components/` are allowed to be "smart").
- [ ] New Redux slices/`createApi` usage stay inside `src/store/`; no ad-hoc `fetch`/`axios` anywhere.
- [ ] Every form: Zod schema colocated in `features/<feature>/schemas/` with hardcoded validation messages, type via `z.infer`, `zodResolver`, shared `components/ui/form.tsx` primitives, `noValidate`.
- [ ] Client-side (Zod) and server-side (API) form errors are not conflated — field errors via `FormMessage`, API errors via a top-level banner using `extractErrorMessage`.
- [ ] All user-facing strings go through `t()`; new keys added to every locale file, not just `en`.
- [ ] New/changed code has colocated tests under a `__tests__/` directory, run with Vitest, asserting on rendered output.
- [ ] Imports use the configured path aliases (`@components`, `@features`, `@i18n`, `@lib`, `@store`, `@theme`), not deep relative paths.
