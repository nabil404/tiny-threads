# Design Specification: React Router & RTK Query Integration (`apps/admin-web`)

## 1. Overview & Goals

This specification defines the architecture and integration pattern for adding **React Router DOM v7** and **RTK Query** (`@reduxjs/toolkit/query/react`) to the merchant administration frontend (`apps/admin-web`).

### Key Goals
- **Client-side Routing**: Provide declarative, type-safe routing with React Router DOM v7 (`createBrowserRouter`), layout routing (`AppLayout`, `AuthLayout`), and route guards (`RequireAuth`, `PublicOnlyRoute`).
- **Data Layer Architecture**: Standardize data fetching and caching with a centralized RTK Query `baseApi` that automatically handles auth token injection, normalized error responses matching `@tiny-threads/shared`, and feature-level endpoint code splitting.
- **Maintain Architectural Conventions**: Strictly follow existing `apps/admin-web/GEMINI.md` guidelines:
  - Centralized store & API slices in `src/store/`.
  - Zero Redux dependencies in pure presentational components (`src/components/`).
  - Container pages (`src/pages/`) connecting route/state to UI.
- **Extensible Shell**: Deliver initial core routes (`/`, `/login`, `/products`, `/orders`, `/settings`, `*`) with full navigation, localization, and theme support.

---

## 2. Dependencies

Add to `apps/admin-web/package.json`:
- `react-router-dom`: `^7.x` (or latest compatible v7)

Existing dependencies already present in workspace:
- `@reduxjs/toolkit`: `^2.6.1` (includes RTK Query)
- `react-redux`: `^9.2.0`
- `@tiny-threads/shared`: `workspace:*`
- `react`: `^19.0.0`
- `react-dom`: `^19.0.0`
- `lucide-react`: `^0.477.0`
- `i18next` & `react-i18next`

---

## 3. Architecture & Project Layout

```sh
apps/admin-web/src/
├── layouts/
│   ├── AppLayout.tsx               # Shell with top navigation, store brand, selectors, profile & <Outlet />
│   └── AuthLayout.tsx              # Centered layout for auth cards & <Outlet />
├── routes/
│   ├── guards/
│   │   ├── RequireAuth.tsx         # Redirects unauthenticated sessions to /login (with location state)
│   │   └── PublicOnlyRoute.tsx     # Redirects authenticated sessions to /
│   └── index.tsx                   # Route definitions created via createBrowserRouter
├── pages/
│   ├── dashboard/
│   │   └── DashboardPage.tsx       # Session overview & diagnostic cards
│   ├── products/
│   │   └── ProductsPage.tsx        # Placeholder with header & empty state card
│   ├── orders/
│   │   └── OrdersPage.tsx          # Placeholder with header & empty state card
│   ├── settings/
│   │   └── SettingsPage.tsx        # Placeholder with header & empty state card
│   └── not-found/
│       └── NotFoundPage.tsx        # 404 page with navigation back to /
├── store/
│   ├── api/
│   │   ├── baseApi.ts              # RTK Query createApi instance with prepareHeaders & tagTypes
│   │   └── endpoints/
│   │       ├── authApi.ts          # login mutation endpoint injection
│   │       └── localeApi.ts        # getLocale query and updateLocale mutation endpoint injection
│   ├── slices/
│   │   ├── appSlice.ts             # UI state: tenantId, tenantName, theme, locale
│   │   └── authSlice.ts            # Auth session: user, token, tenantId, isAuthenticated
│   ├── hooks.ts                    # Typed useAppDispatch & useAppSelector
│   └── index.ts                    # Redux store configuration with baseApi reducer & middleware
├── components/
│   ├── ui/                         # Presentational primitives (shadcn/ui)
│   └── ...                         # Domain presentational components (zero Redux)
├── features/
│   ├── auth/                       # LoginForm, AuthCard, AuthHeader
│   └── common/                     # ThemeSelector, LocaleSelector
├── App.tsx                         # Root app component rendering <RouterProvider router={router} />
└── main.tsx                        # React 19 entry point with <Provider store={store}>
```

---

## 4. Routing Design

### 4.1 Route Hierarchy

```
<RouterProvider router={router}>
├── [PublicOnlyRoute] -> <AuthLayout>
│   └── /login -> <LoginPage>
├── [RequireAuth] -> <AppLayout>
│   ├── / -> <DashboardPage>
│   ├── /products -> <ProductsPage>
│   ├── /orders -> <OrdersPage>
│   └── /settings -> <SettingsPage>
└── * -> <NotFoundPage>
```

### 4.2 Route Guards
- **`RequireAuth`**:
  - Reads `isAuthenticated` from `useAppSelector(selectAuth)`.
  - If authenticated: returns `<Outlet />`.
  - If not authenticated: returns `<Navigate to="/login" state={{ from: location }} replace />`.
- **`PublicOnlyRoute`**:
  - Reads `isAuthenticated` from `useAppSelector(selectAuth)`.
  - If authenticated: returns `<Navigate to={(location.state?.from?.pathname as string) || '/'} replace />`.
  - If not authenticated: returns `<Outlet />`.

### 4.3 App Layout Navigation
- Top navigation bar featuring:
  - Brand identity (`Store` icon + `tenantName`)
  - Navigation links (`Dashboard` -> `/`, `Products` -> `/products`, `Orders` -> `/orders`, `Settings` -> `/settings`) using `NavLink` with active highlighting (`text-primary font-semibold border-b-2 border-primary` or pill badge styling)
  - `Badge` (Tenant ID or Platform context)
  - `ThemeSelector` & `LocaleSelector`
  - Current user avatar / email chip
  - `LogOut` button (dispatches `logout()` action)
- `<Outlet />` rendered inside responsive container (`container mx-auto max-w-6xl p-8`).

---

## 5. RTK Query Architecture

### 5.1 Central Base API (`src/store/api/baseApi.ts`)
Configured using `createApi` and `fetchBaseQuery`:
- **`baseUrl`**: `import.meta.env.VITE_API_BASE_URL ?? ''`
- **`credentials`**: `'include'`
- **`prepareHeaders`**:
  - Inspects `(getState() as RootState).auth.token`.
  - Attaches `Authorization: Bearer <token>` when present.
- **`tagTypes`**: `['Auth', 'Locale', 'Products', 'Orders', 'Settings']`

### 5.2 Endpoint Splitting

#### Auth Endpoints (`src/store/api/endpoints/authApi.ts`)
```ts
export const authApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation<
      { accessToken: string },
      { email: string; password: string }
    >({
      query: (credentials) => ({
        url: '/merchant-admins/auth/login',
        method: 'POST',
        body: credentials,
      }),
      invalidatesTags: ['Auth'],
    }),
  }),
});

export const { useLoginMutation } = authApi;
```

#### Locale Endpoints (`src/store/api/endpoints/localeApi.ts`)
```ts
export const localeApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getLocale: builder.query<{ locale: string | null }, void>({
      query: () => '/merchant-admins/me/locale',
      providesTags: ['Locale'],
    }),
    updateLocale: builder.mutation<{ locale: string | null }, { locale: string | null }>({
      query: (body) => ({
        url: '/merchant-admins/me/locale',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Locale'],
    }),
  }),
});

export const { useGetLocaleQuery, useLazyGetLocaleQuery, useUpdateLocaleMutation } = localeApi;
```

### 5.3 Store Configuration (`src/store/index.ts`)
```ts
import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import appReducer from './slices/appSlice';
import authReducer from './slices/authSlice';
import { baseApi } from './api/baseApi';

export const store = configureStore({
  reducer: {
    app: appReducer,
    auth: authReducer,
    [baseApi.reducerPath]: baseApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(baseApi.middleware),
});

setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

---

## 6. Page & Component Integrations

1. **`LoginForm.tsx`**:
   - Uses `const [loginMutation, { isLoading }] = useLoginMutation();`.
   - On submit, awaits `loginMutation({ email, password }).unwrap()`.
   - Dispatches `loginSuccess` and `setTenant`.
   - Handles errors formatted as `{ error: { code, message } }` or fallback.
2. **`App.tsx`**:
   - Manages top-level theme application and locale hydration.
   - Renders `<RouterProvider router={router} />`.
3. **`DashboardPage.tsx`**:
   - Displays session status, authenticated user email, role, and sample error code card.
4. **`ProductsPage.tsx`, `OrdersPage.tsx`, `SettingsPage.tsx`**:
   - Render clean, consistent placeholder headers and status cards indicating upcoming module readiness.
5. **`NotFoundPage.tsx`**:
   - Renders a user-friendly 404 message with a button linking back to `/`.

---

## 7. Verification & Testing Plan

### Automated Tests
1. **Route Guards & Navigation**:
   - `RequireAuth`: Verifies redirection of unauthenticated users to `/login`.
   - `PublicOnlyRoute`: Verifies redirection of authenticated users to `/`.
   - `NotFoundPage`: Verifies wildcard fallback rendering.
2. **Layout & App Shell**:
   - `AppLayout`: Verifies header links, active state highlighting, tenant name rendering, and logout trigger.
3. **RTK Query Endpoints**:
   - `authApi`: Verifies endpoint URL, HTTP method, and response handling.
   - `localeApi`: Verifies `getLocale` query and `updateLocale` mutation.
4. **App Root & Full Suite**:
   - `pnpm --filter @tiny-threads/admin-web test`: All tests must pass.
   - `pnpm --filter @tiny-threads/admin-web build`: Vite production bundle and TypeScript checks must succeed.
   - `pnpm --filter @tiny-threads/admin-web lint`: ESLint check must pass.

### Manual Verification
- Launch `pnpm dev:admin-web` and navigate in browser:
  - Visit `/` unauthenticated -> redirected to `/login`.
  - Sign in with demo credentials -> redirected to `/`.
  - Click navigation links (`/products`, `/orders`, `/settings`) -> renders appropriate pages with active navbar styling.
  - Visit `/unknown-path` -> renders 404 page with "Back to Dashboard" button.
  - Click Logout -> redirected to `/login`.
