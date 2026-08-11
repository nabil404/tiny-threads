# React Router & RTK Query Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate React Router DOM v7 and RTK Query into `apps/admin-web`, adding route guards, layouts, initial pages, and feature endpoint code splitting while maintaining strict zero-Redux presentational component boundaries.

**Architecture:** React Router DOM v7 Data Router with nested layout routes (`AuthLayout`, `AppLayout`) and route guards (`RequireAuth`, `PublicOnlyRoute`), backed by a centralized RTK Query `baseApi` with automatic auth token header injection, error handling matching `@tiny-threads/shared`, and injected feature endpoints (`authApi`, `localeApi`).

**Tech Stack:** React 19, React Router DOM v7, Redux Toolkit (RTK Query), TypeScript, Vitest, Testing Library, Tailwind CSS v4, shadcn/ui.

## Global Constraints

- Centralized Redux store and API slices MUST reside strictly inside `apps/admin-web/src/store/`.
- UI presentational components in `src/components/` must remain pure with ZERO Redux imports.
- Use Tailwind CSS v4 classes and existing shadcn/ui components.
- Shared error response formats `{ error: { code, message, params, fields } }` from `@tiny-threads/shared`.
- All tests must pass via Vitest (`pnpm --filter @tiny-threads/admin-web test`).

---

### Task 1: Install `react-router-dom` and Configure Base RTK Query API & Store

**Files:**
- Modify: `apps/admin-web/package.json`
- Create: `apps/admin-web/src/store/api/baseApi.ts`
- Modify: `apps/admin-web/src/store/index.ts`
- Test: `apps/admin-web/src/store/api/__tests__/baseApi.test.ts`

**Interfaces:**
- Consumes: `RootState` from `src/store/index.ts`
- Produces: `baseApi` instance from `src/store/api/baseApi.ts`, updated `store` with `baseApi.reducer` and `baseApi.middleware`

- [ ] **Step 1: Install `react-router-dom` dependency**

Run: `pnpm --filter @tiny-threads/admin-web add react-router-dom`

- [ ] **Step 2: Write the failing test for `baseApi` and store configuration**

Create `apps/admin-web/src/store/api/__tests__/baseApi.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { baseApi } from '../baseApi';
import { store } from '../../index';

describe('baseApi and store configuration', () => {
  it('defines baseApi with expected reducerPath and tagTypes', () => {
    expect(baseApi.reducerPath).toBe('api');
    expect(baseApi.endpoints).toBeDefined();
  });

  it('includes api reducer in root store state', () => {
    const state = store.getState();
    expect(state).toHaveProperty('api');
    expect(state).toHaveProperty('app');
    expect(state).toHaveProperty('auth');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/admin-web test src/store/api/__tests__/baseApi.test.ts`
Expected: FAIL (Cannot find module '../baseApi')

- [ ] **Step 4: Implement `baseApi.ts` and update `store/index.ts`**

Create `apps/admin-web/src/store/api/baseApi.ts`:
```ts
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { RootState } from '../index';

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
    credentials: 'include',
    prepareHeaders: (headers, { getState }) => {
      const state = getState() as RootState;
      const token = state.auth?.token;
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      return headers;
    },
  }),
  tagTypes: ['Auth', 'Locale', 'Products', 'Orders', 'Settings'],
  endpoints: () => ({}),
});
```

Update `apps/admin-web/src/store/index.ts`:
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

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/admin-web test src/store/api/__tests__/baseApi.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/admin-web/package.json pnpm-lock.yaml apps/admin-web/src/store/api/baseApi.ts apps/admin-web/src/store/index.ts apps/admin-web/src/store/api/__tests__/baseApi.test.ts
git commit -m "feat(admin-web): add react-router-dom and configure rtk query baseApi"
```

---

### Task 2: Implement RTK Query Feature Endpoints (`authApi` & `localeApi`)

**Files:**
- Create: `apps/admin-web/src/store/api/endpoints/authApi.ts`
- Create: `apps/admin-web/src/store/api/endpoints/localeApi.ts`
- Test: `apps/admin-web/src/store/api/endpoints/__tests__/authApi.test.ts`
- Test: `apps/admin-web/src/store/api/endpoints/__tests__/localeApi.test.ts`

**Interfaces:**
- Consumes: `baseApi` from `src/store/api/baseApi.ts`
- Produces: `useLoginMutation`, `authApi`, `useGetLocaleQuery`, `useLazyGetLocaleQuery`, `useUpdateLocaleMutation`, `localeApi`

- [ ] **Step 1: Write failing tests for `authApi` and `localeApi`**

Create `apps/admin-web/src/store/api/endpoints/__tests__/authApi.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { authApi } from '../authApi';

describe('authApi endpoints', () => {
  it('injects login endpoint mutation', () => {
    expect(authApi.endpoints.login).toBeDefined();
    expect(typeof authApi.endpoints.login.useMutation).toBe('function');
  });
});
```

Create `apps/admin-web/src/store/api/endpoints/__tests__/localeApi.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { localeApi } from '../localeApi';

describe('localeApi endpoints', () => {
  it('injects getLocale and updateLocale endpoints', () => {
    expect(localeApi.endpoints.getLocale).toBeDefined();
    expect(typeof localeApi.endpoints.getLocale.useQuery).toBe('function');
    expect(localeApi.endpoints.updateLocale).toBeDefined();
    expect(typeof localeApi.endpoints.updateLocale.useMutation).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify they fail**

Run: `pnpm --filter @tiny-threads/admin-web test src/store/api/endpoints/__tests__/`
Expected: FAIL (Modules not found)

- [ ] **Step 3: Implement `authApi.ts` and `localeApi.ts`**

Create `apps/admin-web/src/store/api/endpoints/authApi.ts`:
```ts
import { baseApi } from '../baseApi';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
}

export const authApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation<LoginResponse, LoginRequest>({
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

Create `apps/admin-web/src/store/api/endpoints/localeApi.ts`:
```ts
import { baseApi } from '../baseApi';

export interface GetLocaleResponse {
  locale: string | null;
}

export interface UpdateLocaleRequest {
  locale: string | null;
}

export const localeApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getLocale: builder.query<GetLocaleResponse, void>({
      query: () => '/merchant-admins/me/locale',
      providesTags: ['Locale'],
    }),
    updateLocale: builder.mutation<GetLocaleResponse, UpdateLocaleRequest>({
      query: (body) => ({
        url: '/merchant-admins/me/locale',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Locale'],
    }),
  }),
});

export const {
  useGetLocaleQuery,
  useLazyGetLocaleQuery,
  useUpdateLocaleMutation,
} = localeApi;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @tiny-threads/admin-web test src/store/api/endpoints/__tests__/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/src/store/api/endpoints/
git commit -m "feat(admin-web): implement authApi and localeApi RTK Query endpoints"
```

---

### Task 3: Implement Route Guards (`RequireAuth` & `PublicOnlyRoute`)

**Files:**
- Create: `apps/admin-web/src/routes/guards/RequireAuth.tsx`
- Create: `apps/admin-web/src/routes/guards/PublicOnlyRoute.tsx`
- Test: `apps/admin-web/src/routes/guards/__tests__/guards.test.tsx`

**Interfaces:**
- Consumes: `selectAuth` from `src/store/slices/authSlice.ts`, `react-router-dom` (`Outlet`, `Navigate`, `useLocation`)
- Produces: `<RequireAuth />`, `<PublicOnlyRoute />` components

- [ ] **Step 1: Write failing tests for route guards**

Create `apps/admin-web/src/routes/guards/__tests__/guards.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import authReducer from '@store/slices/authSlice';
import appReducer from '@store/slices/appSlice';
import { RequireAuth } from '../RequireAuth';
import { PublicOnlyRoute } from '../PublicOnlyRoute';

function renderWithAuth(initialEntries: string[], isAuthenticated: boolean) {
  const store = configureStore({
    reducer: { auth: authReducer, app: appReducer },
    preloadedState: {
      auth: {
        user: isAuthenticated ? { id: '1', email: 'a@b.com', name: 'User', role: 'admin' } : null,
        tenantId: isAuthenticated ? 'tenant-1' : null,
        token: isAuthenticated ? 'valid-token' : null,
        isAuthenticated,
        status: 'idle',
        error: null,
      },
    },
  });

  const router = createMemoryRouter(
    [
      {
        element: <RequireAuth />,
        children: [{ path: '/protected', element: <div>Protected Page</div> }],
      },
      {
        element: <PublicOnlyRoute />,
        children: [{ path: '/login', element: <div>Login Page</div> }],
      },
      { path: '/', element: <div>Home Page</div> },
    ],
    { initialEntries },
  );

  return render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
}

describe('Route Guards', () => {
  it('RequireAuth redirects unauthenticated user to /login', () => {
    renderWithAuth(['/protected'], false);
    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Page')).not.toBeInTheDocument();
  });

  it('RequireAuth renders child route when authenticated', () => {
    renderWithAuth(['/protected'], true);
    expect(screen.getByText('Protected Page')).toBeInTheDocument();
  });

  it('PublicOnlyRoute redirects authenticated user to /', () => {
    renderWithAuth(['/login'], true);
    expect(screen.getByText('Home Page')).toBeInTheDocument();
  });

  it('PublicOnlyRoute renders login page when unauthenticated', () => {
    renderWithAuth(['/login'], false);
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/admin-web test src/routes/guards/__tests__/guards.test.tsx`
Expected: FAIL (Cannot find modules `RequireAuth` and `PublicOnlyRoute`)

- [ ] **Step 3: Implement `RequireAuth.tsx` and `PublicOnlyRoute.tsx`**

Create `apps/admin-web/src/routes/guards/RequireAuth.tsx`:
```tsx
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAppSelector } from '@store/hooks';
import { selectAuth } from '@store/slices/authSlice';

export function RequireAuth() {
  const { isAuthenticated } = useAppSelector(selectAuth);
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
```

Create `apps/admin-web/src/routes/guards/PublicOnlyRoute.tsx`:
```tsx
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAppSelector } from '@store/hooks';
import { selectAuth } from '@store/slices/authSlice';

export function PublicOnlyRoute() {
  const { isAuthenticated } = useAppSelector(selectAuth);
  const location = useLocation();
  const from = (location.state as { from?: { pathname?: string } })?.from?.pathname ?? '/';

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  return <Outlet />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/admin-web test src/routes/guards/__tests__/guards.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/src/routes/guards/
git commit -m "feat(admin-web): implement RequireAuth and PublicOnlyRoute guards"
```

---

### Task 4: Implement Layouts (`AuthLayout` & `AppLayout`)

**Files:**
- Create: `apps/admin-web/src/layouts/AuthLayout.tsx`
- Create: `apps/admin-web/src/layouts/AppLayout.tsx`
- Test: `apps/admin-web/src/layouts/__tests__/AppLayout.test.tsx`

**Interfaces:**
- Consumes: `useAppSelector`, `useAppDispatch`, `selectApp`, `selectAuth`, `logout`, `ThemeSelector`, `LocaleSelector`, `react-router-dom` (`Outlet`, `NavLink`)
- Produces: `<AuthLayout />`, `<AppLayout />`

- [ ] **Step 1: Write failing test for `AppLayout`**

Create `apps/admin-web/src/layouts/__tests__/AppLayout.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import appReducer from '@store/slices/appSlice';
import authReducer from '@store/slices/authSlice';
import { AppLayout } from '../AppLayout';

function renderAppLayout() {
  const store = configureStore({
    reducer: { app: appReducer, auth: authReducer },
    preloadedState: {
      app: { tenantId: 'tenant-demo', tenantName: 'Demo Store', theme: 'dark', locale: 'en' },
      auth: {
        user: { id: 'usr_1', email: 'admin@demo.com', name: 'Admin', role: 'admin' },
        tenantId: 'tenant-demo',
        token: 'tok-123',
        isAuthenticated: true,
        status: 'succeeded',
        error: null,
      },
    },
  });

  const router = createMemoryRouter(
    [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <div>Dashboard Outlet Content</div> },
          { path: '/products', element: <div>Products Outlet Content</div> },
        ],
      },
    ],
    { initialEntries: ['/'] },
  );

  return {
    store,
    ...render(
      <Provider store={store}>
        <RouterProvider router={router} />
      </Provider>,
    ),
  };
}

describe('AppLayout', () => {
  it('renders store header, tenant badge, navigation links, and outlet content', () => {
    renderAppLayout();
    expect(screen.getByText('Demo Store')).toBeInTheDocument();
    expect(screen.getByText('Dashboard Outlet Content')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /products/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /orders/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument();
  });

  it('dispatches logout action when log out button is clicked', async () => {
    const user = userEvent.setup();
    const { store } = renderAppLayout();
    const logoutBtn = screen.getByRole('button', { name: /log out/i });
    await user.click(logoutBtn);
    expect(store.getState().auth.isAuthenticated).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/admin-web test src/layouts/__tests__/AppLayout.test.tsx`
Expected: FAIL (Cannot find module `../AppLayout`)

- [ ] **Step 3: Implement `AuthLayout.tsx` and `AppLayout.tsx`**

Create `apps/admin-web/src/layouts/AuthLayout.tsx`:
```tsx
import { Outlet } from 'react-router-dom';

export function AuthLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <Outlet />
    </div>
  );
}
```

Create `apps/admin-web/src/layouts/AppLayout.tsx`:
```tsx
import { Outlet, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { selectApp } from '@store/slices/appSlice';
import { selectAuth, logout } from '@store/slices/authSlice';
import { ThemeSelector, LocaleSelector } from '@features/common';
import { Button } from '@components/ui/button';
import { Badge } from '@components/ui/badge';
import {
  Store,
  LogOut,
  LayoutDashboard,
  Package,
  ShoppingCart,
  Settings,
} from 'lucide-react';

export function AppLayout() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { tenantId, tenantName } = useAppSelector(selectApp);
  const { user } = useAppSelector(selectAuth);

  const navItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/products', label: 'Products', icon: Package, end: false },
    { to: '/orders', label: 'Orders', icon: ShoppingCart, end: false },
    { to: '/settings', label: 'Settings', icon: Settings, end: false },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-200">
      <header className="border-b border-border bg-card/60 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <Store className="h-6 w-6 text-primary" />
              <span className="font-bold text-lg tracking-tight">{tenantName}</span>
            </div>
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      isActive
                        ? 'bg-primary/10 text-primary font-semibold'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`
                  }
                >
                  <item.icon className="h-3.5 w-3.5" />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2.5">
            <Badge
              variant={tenantId ? 'default' : 'secondary'}
              className="px-2.5 py-0.5 text-xs hidden sm:inline-flex"
            >
              {tenantId ? t('app.tenantBadge', { tenantId }) : t('app.platformContext')}
            </Badge>
            <ThemeSelector />
            <LocaleSelector />
            {user && (
              <span className="text-xs text-muted-foreground hidden lg:inline-block">
                {user.email}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => dispatch(logout())}
              className="gap-1.5 text-destructive border-destructive/20 hover:bg-destructive/10 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>{t('app.logOut')}</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-6xl p-6">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/admin-web test src/layouts/__tests__/AppLayout.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/src/layouts/
git commit -m "feat(admin-web): implement AuthLayout and AppLayout components"
```

---

### Task 5: Implement Page Containers (`DashboardPage`, `ProductsPage`, `OrdersPage`, `SettingsPage`, `NotFoundPage`)

**Files:**
- Create: `apps/admin-web/src/pages/dashboard/DashboardPage.tsx`
- Create: `apps/admin-web/src/pages/products/ProductsPage.tsx`
- Create: `apps/admin-web/src/pages/orders/OrdersPage.tsx`
- Create: `apps/admin-web/src/pages/settings/SettingsPage.tsx`
- Create: `apps/admin-web/src/pages/not-found/NotFoundPage.tsx`
- Test: `apps/admin-web/src/pages/__tests__/pages.test.tsx`

**Interfaces:**
- Consumes: `@components/ui/card`, `@components/ui/button`, `@store/hooks`, `@tiny-threads/shared` `ErrorCode`, `react-router-dom` (`Link`)
- Produces: `DashboardPage`, `ProductsPage`, `OrdersPage`, `SettingsPage`, `NotFoundPage`

- [ ] **Step 1: Write failing tests for pages**

Create `apps/admin-web/src/pages/__tests__/pages.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import authReducer from '@store/slices/authSlice';
import appReducer from '@store/slices/appSlice';
import { DashboardPage } from '../dashboard/DashboardPage';
import { ProductsPage } from '../products/ProductsPage';
import { OrdersPage } from '../orders/OrdersPage';
import { SettingsPage } from '../settings/SettingsPage';
import { NotFoundPage } from '../not-found/NotFoundPage';

function renderWithStore(ui: React.ReactElement) {
  const store = configureStore({
    reducer: { auth: authReducer, app: appReducer },
    preloadedState: {
      auth: {
        user: { id: '1', email: 'owner@example.com', name: 'Owner', role: 'MERCHANT_ADMIN' },
        tenantId: 'tenant-1',
        token: 'tok',
        isAuthenticated: true,
        status: 'succeeded',
        error: null,
      },
      app: { tenantId: 'tenant-1', tenantName: 'Store 1', theme: 'dark', locale: 'en' },
    },
  });

  return render(
    <Provider store={store}>
      <MemoryRouter>{ui}</MemoryRouter>
    </Provider>,
  );
}

describe('Pages', () => {
  it('renders DashboardPage with user info', () => {
    renderWithStore(<DashboardPage />);
    expect(screen.getByText(/owner@example.com/i)).toBeInTheDocument();
  });

  it('renders ProductsPage placeholder', () => {
    renderWithStore(<ProductsPage />);
    expect(screen.getByRole('heading', { name: /products/i })).toBeInTheDocument();
  });

  it('renders OrdersPage placeholder', () => {
    renderWithStore(<OrdersPage />);
    expect(screen.getByRole('heading', { name: /orders/i })).toBeInTheDocument();
  });

  it('renders SettingsPage placeholder', () => {
    renderWithStore(<SettingsPage />);
    expect(screen.getByRole('heading', { name: /settings/i })).toBeInTheDocument();
  });

  it('renders NotFoundPage with back link', () => {
    renderWithStore(<NotFoundPage />);
    expect(screen.getByText(/404/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to dashboard/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/admin-web test src/pages/__tests__/pages.test.tsx`
Expected: FAIL (Cannot find page modules)

- [ ] **Step 3: Implement page components**

Create `apps/admin-web/src/pages/dashboard/DashboardPage.tsx`:
```tsx
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '@store/hooks';
import { selectAuth } from '@store/slices/authSlice';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@components/ui/card';
import { ErrorCode } from '@tiny-threads/shared';
import { ShieldAlert, Layers, User as UserIcon } from 'lucide-react';

export function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAppSelector(selectAuth);

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card text-card-foreground">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <span>{t('app.authenticatedSessionTitle')}</span>
          </CardTitle>
          <CardDescription>
            {t('app.authenticatedSessionDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-muted border border-border">
              <span className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5 mb-1">
                <UserIcon className="h-3.5 w-3.5" /> {t('app.loggedInUser')}
              </span>
              <p className="text-base font-medium">
                {user?.name} ({user?.email})
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('app.role', { role: user?.role })}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted border border-border">
              <span className="text-xs font-semibold uppercase text-muted-foreground">
                {t('app.sharedErrorCode')}
              </span>
              <p className="text-sm font-mono mt-1 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-500" />
                <span>{ErrorCode.AUTH_INSUFFICIENT_ROLE}</span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

Create `apps/admin-web/src/pages/products/ProductsPage.tsx`:
```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@components/ui/card';
import { Package } from 'lucide-react';

export function ProductsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Products</h1>
        <p className="text-sm text-muted-foreground">
          Manage your store inventory, variants, and product catalog.
        </p>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            <span>Product Catalog</span>
          </CardTitle>
          <CardDescription>
            Product management module integration ready.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-8 text-center border border-dashed border-border rounded-lg text-muted-foreground text-sm">
            Product catalog management will be connected in upcoming features.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

Create `apps/admin-web/src/pages/orders/OrdersPage.tsx`:
```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@components/ui/card';
import { ShoppingCart } from 'lucide-react';

export function OrdersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
        <p className="text-sm text-muted-foreground">
          Track customer orders, fulfillments, and payments.
        </p>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            <span>Order Fulfillment</span>
          </CardTitle>
          <CardDescription>
            Order processing module integration ready.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-8 text-center border border-dashed border-border rounded-lg text-muted-foreground text-sm">
            Order management views will be connected in upcoming features.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

Create `apps/admin-web/src/pages/settings/SettingsPage.tsx`:
```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@components/ui/card';
import { Settings } from 'lucide-react';

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Store Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure store metadata, checkout rules, and tenant preferences.
        </p>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            <span>Store Configuration</span>
          </CardTitle>
          <CardDescription>
            Tenant configuration options and store preferences.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-8 text-center border border-dashed border-border rounded-lg text-muted-foreground text-sm">
            Store settings and payment provider configurations ready for connection.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

Create `apps/admin-web/src/pages/not-found/NotFoundPage.tsx`:
```tsx
import { Link } from 'react-router-dom';
import { Button } from '@components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@components/ui/card';
import { AlertTriangle, Home } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <Card className="max-w-md w-full border-border text-center">
        <CardHeader>
          <div className="mx-auto h-12 w-12 rounded-full bg-amber-500/10 flex items-center justify-center mb-2">
            <AlertTriangle className="h-6 w-6 text-amber-500" />
          </div>
          <CardTitle className="text-2xl">404 - Page Not Found</CardTitle>
          <CardDescription>
            The page you requested does not exist or has been moved.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="gap-2 cursor-pointer">
            <Link to="/">
              <Home className="h-4 w-4" />
              <span>Back to Dashboard</span>
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/admin-web test src/pages/__tests__/pages.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/src/pages/
git commit -m "feat(admin-web): implement Dashboard, Products, Orders, Settings, and NotFound pages"
```

---

### Task 6: Connect Router, Update `LoginForm` with `authApi`, and Wire `App.tsx`

**Files:**
- Create: `apps/admin-web/src/routes/index.tsx`
- Modify: `apps/admin-web/src/features/auth/components/LoginForm.tsx`
- Modify: `apps/admin-web/src/features/auth/components/__tests__/LoginForm.test.tsx`
- Modify: `apps/admin-web/src/App.tsx`
- Modify: `apps/admin-web/src/__tests__/App.test.tsx`

**Interfaces:**
- Consumes: All layouts, route guards, pages, `useLoginMutation`, `useGetLocaleQuery`
- Produces: `router` created with `createBrowserRouter`, connected `App` root component

- [ ] **Step 1: Create `src/routes/index.tsx`**

Create `apps/admin-web/src/routes/index.tsx`:
```tsx
import { createBrowserRouter } from 'react-router-dom';
import { RequireAuth } from './guards/RequireAuth';
import { PublicOnlyRoute } from './guards/PublicOnlyRoute';
import { AppLayout } from '../layouts/AppLayout';
import { AuthLayout } from '../layouts/AuthLayout';
import { LoginPage } from '../features/auth';
import { DashboardPage } from '../pages/dashboard/DashboardPage';
import { ProductsPage } from '../pages/products/ProductsPage';
import { OrdersPage } from '../pages/orders/OrdersPage';
import { SettingsPage } from '../pages/settings/SettingsPage';
import { NotFoundPage } from '../pages/not-found/NotFoundPage';

export const router = createBrowserRouter([
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <DashboardPage /> },
          { path: '/products', element: <ProductsPage /> },
          { path: '/orders', element: <OrdersPage /> },
          { path: '/settings', element: <SettingsPage /> },
        ],
      },
    ],
  },
  {
    element: <PublicOnlyRoute />,
    children: [
      {
        element: <AuthLayout />,
        children: [{ path: '/login', element: <LoginPage /> }],
      },
    ],
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
]);
```

- [ ] **Step 2: Update `LoginForm.tsx` to use RTK Query `useLoginMutation` and `useLazyGetLocaleQuery`**

Update `apps/admin-web/src/features/auth/components/LoginForm.tsx`:
```tsx
import { useState, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppDispatch } from '@store/hooks';
import { setTenant, setLocale } from '@store/slices/appSlice';
import { loginSuccess } from '@store/slices/authSlice';
import { useLoginMutation } from '@store/api/endpoints/authApi';
import { useLazyGetLocaleQuery } from '@store/api/endpoints/localeApi';
import { Input } from '@components/ui/input';
import { Label } from '@components/ui/label';
import { Button } from '@components/ui/button';
import type { LocaleId } from '@i18n/locales';
import { LOCALES } from '@i18n/locales';
import type { ErrorResponseBody } from '@tiny-threads/shared';
import { ArrowRight, Lock, User, AlertCircle } from 'lucide-react';

export interface LoginFormProps {
  initialEmail?: string;
  onSuccess?: () => void;
}

export function LoginForm({ initialEmail = '', onSuccess }: LoginFormProps) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const emailId = useId();
  const passwordId = useId();

  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [loginMutation, { isLoading }] = useLoginMutation();
  const [fetchLocale] = useLazyGetLocaleQuery();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const { accessToken } = await loginMutation({ email, password }).unwrap();

      dispatch(
        loginSuccess({
          token: accessToken,
          user: {
            id: 'usr_m1',
            email,
            name: 'Merchant Admin',
            role: 'MERCHANT_ADMIN',
          },
          tenantId: 'tenant_demo_1',
        }),
      );

      dispatch(
        setTenant({
          id: 'tenant_demo_1',
          name: 'Tiny Threads Apparels',
        }),
      );

      try {
        const localeResult = await fetchLocale().unwrap();
        if (localeResult.locale && LOCALES.some((l) => l.id === localeResult.locale)) {
          dispatch(setLocale(localeResult.locale as LocaleId));
        }
      } catch (localeErr) {
        console.error('Failed to hydrate locale preference', localeErr);
      }

      onSuccess?.();
    } catch (err: unknown) {
      const customErr = err as { data?: ErrorResponseBody; message?: string };
      const errorMessage =
        customErr.data?.error?.message ?? customErr.message ?? t('auth.genericError');
      setError(errorMessage);
    }
  };

  return (
    <div className="w-full">
      {error && (
        <div className="mb-6 p-3.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={emailId} className="text-xs font-medium">
            {t('auth.emailLabel')}
          </Label>
          <div className="relative">
            <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id={emailId}
              type="email"
              placeholder={t('auth.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-9"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor={passwordId} className="text-xs font-medium">
              {t('auth.passwordLabel')}
            </Label>
            <span className="text-xs text-primary hover:underline cursor-pointer">
              {t('auth.forgotPassword')}
            </span>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id={passwordId}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-9"
              required
            />
          </div>
        </div>

        <Button type="submit" className="w-full mt-2 cursor-pointer" disabled={isLoading}>
          {isLoading ? (
            t('auth.authenticating')
          ) : (
            <span className="flex items-center justify-center gap-2">
              {t('auth.signIn')} <ArrowRight className="h-4 w-4" />
            </span>
          )}
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Update `App.tsx` to render `<RouterProvider router={router} />`**

Update `apps/admin-web/src/App.tsx`:
```tsx
import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { useAppSelector } from '@store/hooks';
import { selectApp } from '@store/slices/appSlice';
import { applyThemeToDocument } from '@theme/themes';
import { router } from './routes';

export default function App() {
  const { theme } = useAppSelector(selectApp);

  React.useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  return <RouterProvider router={router} />;
}
```

- [ ] **Step 4: Update test suites for `LoginForm.test.tsx` and `App.test.tsx`**

Update `apps/admin-web/src/features/auth/components/__tests__/LoginForm.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { store } from '@store/index';
import { LoginForm } from '../LoginForm';
import * as authApiHooks from '@store/api/endpoints/authApi';
import * as localeApiHooks from '@store/api/endpoints/localeApi';

describe('LoginForm', () => {
  it('renders email and password inputs and sign-in button', () => {
    render(
      <Provider store={store}>
        <LoginForm />
      </Provider>,
    );

    expect(screen.getByPlaceholderText(/name@company.com/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('handles login form submission and calls onSuccess', async () => {
    const mockUnwrapLogin = vi.fn().mockResolvedValue({ accessToken: 'mock-token' });
    const mockLoginMutation = vi.fn().mockReturnValue({ unwrap: mockUnwrapLogin });
    vi.spyOn(authApiHooks, 'useLoginMutation').mockReturnValue([
      mockLoginMutation as any,
      { isLoading: false } as any,
    ]);

    const mockUnwrapLocale = vi.fn().mockResolvedValue({ locale: 'en' });
    const mockFetchLocale = vi.fn().mockReturnValue({ unwrap: mockUnwrapLocale });
    vi.spyOn(localeApiHooks, 'useLazyGetLocaleQuery').mockReturnValue([
      mockFetchLocale as any,
      {} as any,
      {} as any,
    ]);

    const onSuccess = vi.fn();
    const user = userEvent.setup();

    render(
      <Provider store={store}>
        <LoginForm onSuccess={onSuccess} />
      </Provider>,
    );

    await user.type(screen.getByPlaceholderText(/name@company.com/i), 'admin@test.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLoginMutation).toHaveBeenCalledWith({
        email: 'admin@test.com',
        password: 'password123',
      });
      expect(onSuccess).toHaveBeenCalled();
    });
  });
});
```

Update `apps/admin-web/src/__tests__/App.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import appReducer from '@store/slices/appSlice';
import authReducer from '@store/slices/authSlice';
import { baseApi } from '@store/api/baseApi';
import App from '../App';

describe('App root with RouterProvider', () => {
  it('renders login page when unauthenticated', () => {
    const store = configureStore({
      reducer: {
        app: appReducer,
        auth: authReducer,
        [baseApi.reducerPath]: baseApi.reducer,
      },
      preloadedState: {
        auth: {
          user: null,
          tenantId: null,
          token: null,
          isAuthenticated: false,
          status: 'idle',
          error: null,
        },
      },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware().concat(baseApi.middleware),
    });

    render(
      <Provider store={store}>
        <App />
      </Provider>,
    );

    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run tests to verify all tests pass**

Run: `pnpm --filter @tiny-threads/admin-web test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/admin-web/src/routes/ apps/admin-web/src/features/auth/ apps/admin-web/src/App.tsx apps/admin-web/src/__tests__/
git commit -m "feat(admin-web): connect React Router and RTK Query to App and LoginForm"
```

---

### Task 7: Full Workspace Verification

**Files:**
- Test all components, linting, build

- [ ] **Step 1: Run complete admin-web test suite**

Run: `pnpm --filter @tiny-threads/admin-web test`
Expected: All tests pass.

- [ ] **Step 2: Run ESLint across workspace**

Run: `pnpm lint`
Expected: 0 errors.

- [ ] **Step 3: Run full workspace build**

Run: `pnpm build`
Expected: Build passes cleanly.

- [ ] **Step 4: Commit any remaining adjustments**

```bash
git commit -am "chore: complete react router and rtk query integration verification"
```
