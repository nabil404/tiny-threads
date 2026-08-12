# Admin Panel Layout Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Admin Panel layout shell (`Sidebar` and `Topbar`) in `apps/admin-web` with desktop collapsible sidebar, hover tooltips, responsive mobile drawer, global search, user avatar dropdown with integrated theme/locale switchers, and placeholder routes.

**Architecture:** Modular layout hierarchy under `src/layouts/components/` driven by persistent UI preferences in Redux (`appSlice`), using Tailwind CSS v4 responsive utilities, shadcn/ui primitives, and `react-i18next`.

**Tech Stack:** React 19, Vite, TypeScript, Redux Toolkit, Tailwind CSS v4, Lucide React, Vitest, React Testing Library.

## Global Constraints
- Target workspace: `apps/admin-web`
- Zero Redux in `components/ui/` primitives (layout components in `layouts/components/` and `layouts/` are container components and may connect to Redux / hooks).
- All user-facing strings must use `react-i18next`'s `t()` with keys in `src/i18n/locales/*/common.json` across all 4 locales (`en`, `es`, `fr`, `ar`).
- Tests must be colocated under `__tests__/` directories with Vitest and `@testing-library/react`.
- Use configured path aliases (`@components`, `@features`, `@i18n`, `@lib`, `@store`, `@theme`).

---

### Task 1: Redux UI State & Locale Strings

**Files:**
- Modify: `apps/admin-web/src/store/slices/appSlice.ts`
- Create: `apps/admin-web/src/store/slices/__tests__/appSlice.test.ts`
- Modify: `apps/admin-web/src/i18n/locales/en/common.json`
- Modify: `apps/admin-web/src/i18n/locales/es/common.json`
- Modify: `apps/admin-web/src/i18n/locales/fr/common.json`
- Modify: `apps/admin-web/src/i18n/locales/ar/common.json`

**Interfaces:**
- Consumes: None
- Produces: 
  - `sidebarCollapsed: boolean`, `mobileNavOpen: boolean` in `AppState`
  - Actions: `toggleSidebar`, `setSidebarCollapsed`, `toggleMobileNav`, `setMobileNavOpen`
  - Selectors: `selectSidebarCollapsed`, `selectMobileNavOpen`
  - Translation keys under `nav.*`

- [ ] **Step 1: Write the failing test for `appSlice`**

Create `apps/admin-web/src/store/slices/__tests__/appSlice.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import reducer, {
  toggleSidebar,
  setSidebarCollapsed,
  toggleMobileNav,
  setMobileNavOpen,
  selectSidebarCollapsed,
  selectMobileNavOpen,
} from '../appSlice';
import type { RootState } from '../../index';

describe('appSlice layout actions', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('handles toggleSidebar and persists to localStorage', () => {
    const initialState = {
      theme: 'dark' as const,
      locale: 'en' as const,
      sidebarCollapsed: false,
      mobileNavOpen: false,
    };

    const state1 = reducer(initialState, toggleSidebar());
    expect(state1.sidebarCollapsed).toBe(true);
    expect(localStorage.getItem('tiny_threads_sidebar_collapsed')).toBe('true');

    const state2 = reducer(state1, toggleSidebar());
    expect(state2.sidebarCollapsed).toBe(false);
    expect(localStorage.getItem('tiny_threads_sidebar_collapsed')).toBe('false');
  });

  it('handles setSidebarCollapsed with explicit value', () => {
    const initialState = {
      theme: 'dark' as const,
      locale: 'en' as const,
      sidebarCollapsed: false,
      mobileNavOpen: false,
    };

    const state = reducer(initialState, setSidebarCollapsed(true));
    expect(state.sidebarCollapsed).toBe(true);
    expect(localStorage.getItem('tiny_threads_sidebar_collapsed')).toBe('true');
  });

  it('handles toggleMobileNav and setMobileNavOpen without localStorage persistence', () => {
    const initialState = {
      theme: 'dark' as const,
      locale: 'en' as const,
      sidebarCollapsed: false,
      mobileNavOpen: false,
    };

    const state1 = reducer(initialState, toggleMobileNav());
    expect(state1.mobileNavOpen).toBe(true);

    const state2 = reducer(state1, setMobileNavOpen(false));
    expect(state2.mobileNavOpen).toBe(false);
  });

  it('selects sidebarCollapsed and mobileNavOpen from RootState', () => {
    const mockRootState = {
      app: {
        theme: 'dark' as const,
        locale: 'en' as const,
        sidebarCollapsed: true,
        mobileNavOpen: true,
      },
    } as RootState;

    expect(selectSidebarCollapsed(mockRootState)).toBe(true);
    expect(selectMobileNavOpen(mockRootState)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/admin-web test src/store/slices/__tests__/appSlice.test.ts`
Expected: FAIL due to missing actions and state properties.

- [ ] **Step 3: Update `appSlice.ts` and locale files**

Update `apps/admin-web/src/store/slices/appSlice.ts`:
```typescript
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../index';

export type Theme = 'light' | 'dark';
export type Locale = 'en' | 'es' | 'fr' | 'ar';

export interface AppState {
  theme: Theme;
  locale: Locale;
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
}

const getInitialTheme = (): Theme => {
  const saved = localStorage.getItem('tiny_threads_theme');
  return saved === 'light' || saved === 'dark' ? saved : 'dark';
};

const getInitialLocale = (): Locale => {
  const saved = localStorage.getItem('tiny_threads_locale');
  return saved === 'en' || saved === 'es' || saved === 'fr' || saved === 'ar'
    ? saved
    : 'en';
};

const getInitialSidebarCollapsed = (): boolean => {
  return localStorage.getItem('tiny_threads_sidebar_collapsed') === 'true';
};

const initialState: AppState = {
  theme: getInitialTheme(),
  locale: getInitialLocale(),
  sidebarCollapsed: getInitialSidebarCollapsed(),
  mobileNavOpen: false,
};

export const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    setTheme: (state, action: PayloadAction<Theme>) => {
      state.theme = action.payload;
      localStorage.setItem('tiny_threads_theme', action.payload);
    },
    setLocale: (state, action: PayloadAction<Locale>) => {
      state.locale = action.payload;
      localStorage.setItem('tiny_threads_locale', action.payload);
    },
    toggleSidebar: (state) => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
      localStorage.setItem(
        'tiny_threads_sidebar_collapsed',
        String(state.sidebarCollapsed),
      );
    },
    setSidebarCollapsed: (state, action: PayloadAction<boolean>) => {
      state.sidebarCollapsed = action.payload;
      localStorage.setItem(
        'tiny_threads_sidebar_collapsed',
        String(action.payload),
      );
    },
    toggleMobileNav: (state) => {
      state.mobileNavOpen = !state.mobileNavOpen;
    },
    setMobileNavOpen: (state, action: PayloadAction<boolean>) => {
      state.mobileNavOpen = action.payload;
    },
  },
});

export const {
  setTheme,
  setLocale,
  toggleSidebar,
  setSidebarCollapsed,
  toggleMobileNav,
  setMobileNavOpen,
} = appSlice.actions;

export const selectTheme = (state: RootState) => state.app.theme;
export const selectLocale = (state: RootState) => state.app.locale;
export const selectSidebarCollapsed = (state: RootState) =>
  state.app.sidebarCollapsed;
export const selectMobileNavOpen = (state: RootState) =>
  state.app.mobileNavOpen;

export default appSlice.reducer;
```

Update `apps/admin-web/src/i18n/locales/en/common.json`, `es/common.json`, `fr/common.json`, `ar/common.json` with:
```json
"nav": {
  "overview": "Overview",
  "orders": "Orders",
  "products": "Products",
  "categories": "Categories",
  "customers": "Customers",
  "analytics": "Analytics",
  "settings": "Settings",
  "support": "Support",
  "signOut": "Sign Out",
  "searchPlaceholder": "Search...",
  "collapseSidebar": "Collapse sidebar",
  "expandSidebar": "Expand sidebar",
  "toggleMobileMenu": "Toggle menu",
  "activeStatus": "Active",
  "theme": "Theme",
  "language": "Language",
  "accountSettings": "Account Settings",
  "placeholderTitle": "{{title}}",
  "placeholderDescription": "This section is currently under development.",
  "backToDashboard": "Back to Dashboard"
}
```
(and equivalent localized translations for `es`, `fr`, and `ar`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/admin-web test src/store/slices/__tests__/appSlice.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/src/store/slices/ apps/admin-web/src/i18n/locales/
git commit -m "feat(admin-web): add sidebar and mobile nav state to appSlice with translations"
```

---

### Task 2: Placeholder Page Component & Routes

**Files:**
- Create: `apps/admin-web/src/pages/placeholder/PlaceholderPage.tsx`
- Create: `apps/admin-web/src/pages/placeholder/__tests__/PlaceholderPage.test.tsx`
- Modify: `apps/admin-web/src/routes/index.tsx`

**Interfaces:**
- Consumes: `useTranslation` from `react-i18next`, `Link` from `react-router-dom`
- Produces: `PlaceholderPage` component accepting `{ title: string; description?: string }`
- Routes: `/categories`, `/customers`, `/analytics`, `/support`

- [ ] **Step 1: Write the failing test for `PlaceholderPage`**

Create `apps/admin-web/src/pages/placeholder/__tests__/PlaceholderPage.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PlaceholderPage } from '../PlaceholderPage';

describe('PlaceholderPage', () => {
  it('renders title, description, and link back to dashboard', () => {
    render(
      <MemoryRouter>
        <PlaceholderPage title="Categories" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /categories/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to dashboard/i })).toHaveAttribute(
      'href',
      '/',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/admin-web test src/pages/placeholder/__tests__/PlaceholderPage.test.tsx`
Expected: FAIL due to missing component.

- [ ] **Step 3: Implement `PlaceholderPage.tsx` and wire in `routes/index.tsx`**

Create `apps/admin-web/src/pages/placeholder/PlaceholderPage.tsx`:
```tsx
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@components/ui/card';
import { Button } from '@components/ui/button';
import { Construction } from 'lucide-react';

interface PlaceholderPageProps {
  title: string;
  description?: string;
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {description || t('nav.placeholderDescription')}
        </p>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Construction className="h-5 w-5 text-primary" />
            <span>{t('nav.placeholderTitle', { title })}</span>
          </CardTitle>
          <CardDescription>
            {description || t('nav.placeholderDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-8 text-center border border-dashed border-border rounded-lg text-muted-foreground text-sm">
            {t('nav.placeholderDescription')}
          </div>
          <div>
            <Button asChild variant="outline">
              <Link to="/">{t('nav.backToDashboard')}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

Update `apps/admin-web/src/routes/index.tsx`:
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
import { PlaceholderPage } from '../pages/placeholder/PlaceholderPage';
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
          { path: '/categories', element: <PlaceholderPage title="Categories" /> },
          { path: '/customers', element: <PlaceholderPage title="Customers" /> },
          { path: '/analytics', element: <PlaceholderPage title="Analytics" /> },
          { path: '/support', element: <PlaceholderPage title="Support" /> },
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

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/admin-web test src/pages/placeholder/__tests__/PlaceholderPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/src/pages/placeholder/ apps/admin-web/src/routes/index.tsx
git commit -m "feat(admin-web): add PlaceholderPage and wire placeholder routes"
```

---

### Task 3: User Avatar Dropdown Component

**Files:**
- Create: `apps/admin-web/src/layouts/components/UserNavDropdown.tsx`
- Create: `apps/admin-web/src/layouts/components/__tests__/UserNavDropdown.test.tsx`

**Interfaces:**
- Consumes: `useAppSelector`, `useAppDispatch`, `useLogoutMutation`, `ThemeSelector`, `LocaleSelector`
- Produces: `UserNavDropdown` component

- [ ] **Step 1: Write the failing test for `UserNavDropdown`**

Create `apps/admin-web/src/layouts/components/__tests__/UserNavDropdown.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import appReducer from '@store/slices/appSlice';
import authReducer from '@store/slices/authSlice';
import { baseApi } from '@store/api/baseApi';
import { UserNavDropdown } from '../UserNavDropdown';

function renderDropdown(authOverrides = {}) {
  const store = configureStore({
    reducer: {
      app: appReducer,
      auth: authReducer,
      [baseApi.reducerPath]: baseApi.reducer,
    },
    preloadedState: {
      app: { theme: 'dark', locale: 'en', sidebarCollapsed: false, mobileNavOpen: false },
      auth: {
        user: {
          id: 'usr_1',
          email: 'admin@demo.com',
          firstName: 'Jane',
          lastName: 'Doe',
          role: 'owner',
        },
        tenant: { id: 'tenant-demo', name: 'Demo Store' },
        isAuthenticated: true,
        ...authOverrides,
      },
    },
    middleware: (gdm) => gdm().concat(baseApi.middleware),
  });

  return {
    store,
    ...render(
      <Provider store={store}>
        <MemoryRouter>
          <UserNavDropdown />
        </MemoryRouter>
      </Provider>,
    ),
  };
}

describe('UserNavDropdown', () => {
  it('renders user initials and opens dropdown with user info, theme, locale, settings, and sign-out', async () => {
    const user = userEvent.setup();
    renderDropdown();

    const trigger = screen.getByRole('button', { name: /user menu/i });
    expect(trigger).toBeInTheDocument();
    expect(screen.getByText('JD')).toBeInTheDocument();

    await user.click(trigger);

    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('admin@demo.com')).toBeInTheDocument();
    expect(screen.getByText('Demo Store')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /account settings/i })).toHaveAttribute(
      'href',
      '/settings',
    );
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/admin-web test src/layouts/components/__tests__/UserNavDropdown.test.tsx`
Expected: FAIL due to missing component.

- [ ] **Step 3: Implement `UserNavDropdown.tsx`**

Create `apps/admin-web/src/layouts/components/UserNavDropdown.tsx`:
```tsx
import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { selectAuth, logout } from '@store/slices/authSlice';
import { useLogoutMutation } from '@store/api/endpoints/authApi';
import { baseApi } from '@store/api/baseApi';
import { ThemeSelector, LocaleSelector } from '@features/common';
import { Badge } from '@components/ui/badge';
import { Settings, LogOut, Shield } from 'lucide-react';

export function UserNavDropdown() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { user, tenant } = useAppSelector(selectAuth);
  const [logoutApi] = useLogoutMutation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const initials = user?.firstName
    ? `${user.firstName[0]}${user.lastName ? user.lastName[0] : ''}`.toUpperCase()
    : (user?.email?.[0]?.toUpperCase() || 'U');

  const displayName = user?.firstName
    ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ''}`
    : (user?.email || 'User');

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleLogout = async () => {
    try {
      await logoutApi().unwrap();
    } catch {
      // Ignore server error on logout
    } finally {
      dispatch(logout());
      dispatch(baseApi.util.resetApiState());
      setIsOpen(false);
      navigate('/login', { replace: true });
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        aria-label="User menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-9 h-9 rounded-full bg-primary/10 text-primary hover:bg-primary/20 flex items-center justify-center font-bold text-sm border border-border cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20"
      >
        <span>{initials}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 rounded-xl bg-card border border-border shadow-xl py-2 z-50 animate-in fade-in-0 zoom-in-95 duration-100">
          <div className="px-4 py-3 border-b border-border space-y-1.5">
            <div className="font-semibold text-sm text-foreground truncate">
              {displayName}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {user?.email}
            </div>
            <div className="flex items-center gap-1.5 pt-1">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {tenant?.name || t('app.platformContext')}
              </Badge>
              {user?.role && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 capitalize flex items-center gap-1">
                  <Shield className="h-2.5 w-2.5" />
                  {user.role}
                </Badge>
              )}
            </div>
          </div>

          <div className="px-4 py-2.5 border-b border-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{t('nav.theme')}</span>
              <ThemeSelector />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{t('nav.language')}</span>
              <LocaleSelector />
            </div>
          </div>

          <div className="py-1">
            <Link
              to="/settings"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <Settings className="h-4 w-4 text-muted-foreground" />
              <span>{t('nav.accountSettings')}</span>
            </Link>
          </div>

          <div className="pt-1 border-t border-border">
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors cursor-pointer text-left"
            >
              <LogOut className="h-4 w-4" />
              <span>{t('nav.signOut')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/admin-web test src/layouts/components/__tests__/UserNavDropdown.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/src/layouts/components/
git commit -m "feat(admin-web): add UserNavDropdown component with tests"
```

---

### Task 4: Desktop Collapsible Sidebar Component

**Files:**
- Create: `apps/admin-web/src/layouts/components/Sidebar.tsx`
- Create: `apps/admin-web/src/layouts/components/__tests__/Sidebar.test.tsx`

**Interfaces:**
- Consumes: `useAppSelector`, `selectSidebarCollapsed`, `selectAuth`, `useLogoutMutation`, `t` from `react-i18next`
- Produces: `Sidebar` component

- [ ] **Step 1: Write the failing test for `Sidebar`**

Create `apps/admin-web/src/layouts/components/__tests__/Sidebar.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import appReducer from '@store/slices/appSlice';
import authReducer from '@store/slices/authSlice';
import { baseApi } from '@store/api/baseApi';
import { Sidebar } from '../Sidebar';

function renderSidebar(sidebarCollapsed = false) {
  const store = configureStore({
    reducer: {
      app: appReducer,
      auth: authReducer,
      [baseApi.reducerPath]: baseApi.reducer,
    },
    preloadedState: {
      app: { theme: 'dark', locale: 'en', sidebarCollapsed, mobileNavOpen: false },
      auth: {
        user: { id: '1', email: 'admin@demo.com', firstName: 'Admin', lastName: null, role: 'admin' },
        tenant: { id: 'tenant-demo', name: 'Demo Store' },
        isAuthenticated: true,
      },
    },
    middleware: (gdm) => gdm().concat(baseApi.middleware),
  });

  return {
    store,
    ...render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/products']}>
          <Sidebar />
        </MemoryRouter>
      </Provider>,
    ),
  };
}

describe('Sidebar', () => {
  it('renders all navigation items in expanded mode', () => {
    renderSidebar(false);
    expect(screen.getByText('Demo Store')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /orders/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /products/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /categories/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /customers/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /analytics/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /support/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  it('renders in compact mode with icon tooltips', () => {
    const { container } = renderSidebar(true);
    const aside = container.querySelector('aside');
    expect(aside).toHaveClass('w-16');
  });

  it('handles sign-out click', async () => {
    const user = userEvent.setup();
    const { store } = renderSidebar(false);
    const signOutBtn = screen.getByRole('button', { name: /sign out/i });
    await user.click(signOutBtn);
    expect(store.getState().auth.isAuthenticated).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/admin-web test src/layouts/components/__tests__/Sidebar.test.tsx`
Expected: FAIL due to missing component.

- [ ] **Step 3: Implement `Sidebar.tsx`**

Create `apps/admin-web/src/layouts/components/Sidebar.tsx`:
```tsx
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { selectSidebarCollapsed } from '@store/slices/appSlice';
import { selectAuth, logout } from '@store/slices/authSlice';
import { useLogoutMutation } from '@store/api/endpoints/authApi';
import { baseApi } from '@store/api/baseApi';
import { Badge } from '@components/ui/badge';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  FolderTree,
  Users,
  BarChart3,
  Settings,
  HelpCircle,
  LogOut,
} from 'lucide-react';

export function Sidebar() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const isCollapsed = useAppSelector(selectSidebarCollapsed);
  const { tenant } = useAppSelector(selectAuth);
  const [logoutApi] = useLogoutMutation();

  const storeInitials = tenant?.name
    ? tenant.name
        .split(' ')
        .map((w) => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'TT';

  const navItems = [
    { to: '/', label: t('nav.overview'), icon: LayoutDashboard, end: true },
    { to: '/orders', label: t('nav.orders'), icon: ShoppingCart, end: false },
    { to: '/products', label: t('nav.products'), icon: Package, end: false },
    { to: '/categories', label: t('nav.categories'), icon: FolderTree, end: false },
    { to: '/customers', label: t('nav.customers'), icon: Users, end: false },
    { to: '/analytics', label: t('nav.analytics'), icon: BarChart3, end: false },
    { to: '/settings', label: t('nav.settings'), icon: Settings, end: false },
  ];

  const handleLogout = async () => {
    try {
      await logoutApi().unwrap();
    } catch {
      // Ignore server error on logout
    } finally {
      dispatch(logout());
      dispatch(baseApi.util.resetApiState());
      navigate('/login', { replace: true });
    }
  };

  return (
    <aside
      className={`fixed left-0 top-0 h-screen border-r border-border bg-card z-40 hidden md:flex flex-col transition-all duration-300 ease-in-out ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Store Header */}
      <div
        className={`h-16 border-b border-border flex items-center gap-3 px-3 transition-all ${
          isCollapsed ? 'justify-center' : 'px-4'
        }`}
      >
        <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary font-bold flex items-center justify-center text-sm shrink-0">
          {storeInitials}
        </div>
        {!isCollapsed && (
          <div className="min-w-0 flex-1 flex items-center justify-between">
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-foreground truncate">
                {tenant?.name || 'Tiny Threads'}
              </h2>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-[11px] text-muted-foreground">
                  {t('nav.activeStatus')}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation List */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            title={isCollapsed ? item.label : undefined}
            className={({ isActive }) =>
              `group relative flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                isCollapsed ? 'justify-center' : ''
              } ${
                isActive
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!isCollapsed && <span className="truncate">{item.label}</span>}
            {isCollapsed && (
              <span className="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded-md shadow-md opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap border border-border">
                {item.label}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer Actions */}
      <div className="p-2 border-t border-border space-y-1">
        <NavLink
          to="/support"
          title={isCollapsed ? t('nav.support') : undefined}
          className={({ isActive }) =>
            `group relative flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
              isCollapsed ? 'justify-center' : ''
            } ${
              isActive
                ? 'bg-primary/10 text-primary font-semibold'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`
          }
        >
          <HelpCircle className="h-4 w-4 shrink-0" />
          {!isCollapsed && <span className="truncate">{t('nav.support')}</span>}
          {isCollapsed && (
            <span className="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded-md shadow-md opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap border border-border">
              {t('nav.support')}
            </span>
          )}
        </NavLink>

        <button
          type="button"
          onClick={handleLogout}
          title={isCollapsed ? t('nav.signOut') : undefined}
          className={`group relative w-full flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-lg text-destructive hover:bg-destructive/10 transition-colors cursor-pointer ${
            isCollapsed ? 'justify-center' : ''
          }`}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!isCollapsed && <span className="truncate">{t('nav.signOut')}</span>}
          {isCollapsed && (
            <span className="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded-md shadow-md opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap border border-border">
              {t('nav.signOut')}
            </span>
          )}
        </button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/admin-web test src/layouts/components/__tests__/Sidebar.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/src/layouts/components/
git commit -m "feat(admin-web): add desktop collapsible Sidebar component with tests"
```

---

### Task 5: Topbar Component

**Files:**
- Create: `apps/admin-web/src/layouts/components/Topbar.tsx`
- Create: `apps/admin-web/src/layouts/components/__tests__/Topbar.test.tsx`

**Interfaces:**
- Consumes: `useAppDispatch`, `toggleSidebar`, `toggleMobileNav`, `UserNavDropdown`, `t`
- Produces: `Topbar` component

- [ ] **Step 1: Write the failing test for `Topbar`**

Create `apps/admin-web/src/layouts/components/__tests__/Topbar.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import appReducer from '@store/slices/appSlice';
import authReducer from '@store/slices/authSlice';
import { baseApi } from '@store/api/baseApi';
import { Topbar } from '../Topbar';

function renderTopbar() {
  const store = configureStore({
    reducer: {
      app: appReducer,
      auth: authReducer,
      [baseApi.reducerPath]: baseApi.reducer,
    },
    preloadedState: {
      app: { theme: 'dark', locale: 'en', sidebarCollapsed: false, mobileNavOpen: false },
      auth: {
        user: { id: '1', email: 'admin@demo.com', firstName: 'Admin', lastName: null, role: 'admin' },
        tenant: { id: 'tenant-demo', name: 'Demo Store' },
        isAuthenticated: true,
      },
    },
    middleware: (gdm) => gdm().concat(baseApi.middleware),
  });

  return {
    store,
    ...render(
      <Provider store={store}>
        <MemoryRouter>
          <Topbar />
        </MemoryRouter>
      </Provider>,
    ),
  };
}

describe('Topbar', () => {
  it('renders search input and triggers sidebar toggle actions', async () => {
    const user = userEvent.setup();
    const { store } = renderTopbar();

    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();

    const collapseBtn = screen.getByRole('button', { name: /collapse sidebar|expand sidebar/i });
    await user.click(collapseBtn);
    expect(store.getState().app.sidebarCollapsed).toBe(true);

    const mobileBtn = screen.getByRole('button', { name: /toggle menu/i });
    await user.click(mobileBtn);
    expect(store.getState().app.mobileNavOpen).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/admin-web test src/layouts/components/__tests__/Topbar.test.tsx`
Expected: FAIL due to missing component.

- [ ] **Step 3: Implement `Topbar.tsx`**

Create `apps/admin-web/src/layouts/components/Topbar.tsx`:
```tsx
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import {
  toggleSidebar,
  toggleMobileNav,
  selectSidebarCollapsed,
} from '@store/slices/appSlice';
import { UserNavDropdown } from './UserNavDropdown';
import { Search, Menu, PanelLeftClose, PanelLeft } from 'lucide-react';

export function Topbar() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const isCollapsed = useAppSelector(selectSidebarCollapsed);

  return (
    <header className="h-16 w-full border-b border-border bg-card/80 backdrop-blur-md sticky top-0 right-0 z-30 flex items-center justify-between px-4 md:px-6">
      {/* Left section: toggles & search */}
      <div className="flex items-center gap-3 w-full max-w-md">
        {/* Mobile Hamburger Toggle */}
        <button
          type="button"
          aria-label={t('nav.toggleMobileMenu')}
          onClick={() => dispatch(toggleMobileNav())}
          className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Desktop Collapse Toggle */}
        <button
          type="button"
          aria-label={
            isCollapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')
          }
          onClick={() => dispatch(toggleSidebar())}
          className="hidden md:flex p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
        >
          {isCollapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>

        {/* Global Search */}
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder={t('nav.searchPlaceholder')}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-border bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
          />
        </div>
      </div>

      {/* Right section: User Avatar dropdown */}
      <div className="flex items-center gap-3">
        <UserNavDropdown />
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/admin-web test src/layouts/components/__tests__/Topbar.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/src/layouts/components/
git commit -m "feat(admin-web): add Topbar component with search and toggles"
```

---

### Task 6: Mobile Navigation Drawer Component

**Files:**
- Create: `apps/admin-web/src/layouts/components/MobileNavDrawer.tsx`
- Create: `apps/admin-web/src/layouts/components/__tests__/MobileNavDrawer.test.tsx`

**Interfaces:**
- Consumes: `useAppSelector`, `useAppDispatch`, `selectMobileNavOpen`, `setMobileNavOpen`, `selectAuth`, `useLogoutMutation`
- Produces: `MobileNavDrawer` component

- [ ] **Step 1: Write the failing test for `MobileNavDrawer`**

Create `apps/admin-web/src/layouts/components/__tests__/MobileNavDrawer.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import appReducer from '@store/slices/appSlice';
import authReducer from '@store/slices/authSlice';
import { baseApi } from '@store/api/baseApi';
import { MobileNavDrawer } from '../MobileNavDrawer';

function renderMobileDrawer(mobileNavOpen = true) {
  const store = configureStore({
    reducer: {
      app: appReducer,
      auth: authReducer,
      [baseApi.reducerPath]: baseApi.reducer,
    },
    preloadedState: {
      app: { theme: 'dark', locale: 'en', sidebarCollapsed: false, mobileNavOpen },
      auth: {
        user: { id: '1', email: 'admin@demo.com', firstName: 'Admin', lastName: null, role: 'admin' },
        tenant: { id: 'tenant-demo', name: 'Demo Store' },
        isAuthenticated: true,
      },
    },
    middleware: (gdm) => gdm().concat(baseApi.middleware),
  });

  return {
    store,
    ...render(
      <Provider store={store}>
        <MemoryRouter>
          <MobileNavDrawer />
        </MemoryRouter>
      </Provider>,
    ),
  };
}

describe('MobileNavDrawer', () => {
  it('renders navigation links and closes on backdrop or link click', async () => {
    const user = userEvent.setup();
    const { store } = renderMobileDrawer(true);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /overview/i })).toBeInTheDocument();

    const link = screen.getByRole('link', { name: /products/i });
    await user.click(link);
    expect(store.getState().app.mobileNavOpen).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/admin-web test src/layouts/components/__tests__/MobileNavDrawer.test.tsx`
Expected: FAIL due to missing component.

- [ ] **Step 3: Implement `MobileNavDrawer.tsx`**

Create `apps/admin-web/src/layouts/components/MobileNavDrawer.tsx`:
```tsx
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import {
  selectMobileNavOpen,
  setMobileNavOpen,
} from '@store/slices/appSlice';
import { selectAuth, logout } from '@store/slices/authSlice';
import { useLogoutMutation } from '@store/api/endpoints/authApi';
import { baseApi } from '@store/api/baseApi';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  FolderTree,
  Users,
  BarChart3,
  Settings,
  HelpCircle,
  LogOut,
  X,
} from 'lucide-react';

export function MobileNavDrawer() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const isOpen = useAppSelector(selectMobileNavOpen);
  const { tenant } = useAppSelector(selectAuth);
  const [logoutApi] = useLogoutMutation();

  if (!isOpen) return null;

  const storeInitials = tenant?.name
    ? tenant.name
        .split(' ')
        .map((w) => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'TT';

  const navItems = [
    { to: '/', label: t('nav.overview'), icon: LayoutDashboard, end: true },
    { to: '/orders', label: t('nav.orders'), icon: ShoppingCart, end: false },
    { to: '/products', label: t('nav.products'), icon: Package, end: false },
    { to: '/categories', label: t('nav.categories'), icon: FolderTree, end: false },
    { to: '/customers', label: t('nav.customers'), icon: Users, end: false },
    { to: '/analytics', label: t('nav.analytics'), icon: BarChart3, end: false },
    { to: '/settings', label: t('nav.settings'), icon: Settings, end: false },
  ];

  const handleClose = () => {
    dispatch(setMobileNavOpen(false));
  };

  const handleLogout = async () => {
    try {
      await logoutApi().unwrap();
    } catch {
      // Ignore server logout error
    } finally {
      dispatch(logout());
      dispatch(baseApi.util.resetApiState());
      handleClose();
      navigate('/login', { replace: true });
    }
  };

  return (
    <div className="md:hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 animate-in fade-in-0"
        onClick={handleClose}
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-y-0 left-0 z-50 w-3/4 max-w-xs bg-card border-r border-border p-4 shadow-xl flex flex-col animate-in slide-in-from-left duration-200"
      >
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary font-bold flex items-center justify-center text-xs">
              {storeInitials}
            </div>
            <span className="font-bold text-sm text-foreground truncate">
              {tenant?.name || 'Tiny Threads'}
            </span>
          </div>
          <button
            type="button"
            aria-label="Close menu"
            onClick={handleClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={handleClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                  isActive
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="pt-2 border-t border-border space-y-1">
          <NavLink
            to="/support"
            onClick={handleClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                isActive
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`
            }
          >
            <HelpCircle className="h-4 w-4" />
            <span>{t('nav.support')}</span>
          </NavLink>

          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-lg text-destructive hover:bg-destructive/10 transition-colors text-left"
          >
            <LogOut className="h-4 w-4" />
            <span>{t('nav.signOut')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/admin-web test src/layouts/components/__tests__/MobileNavDrawer.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/src/layouts/components/
git commit -m "feat(admin-web): add MobileNavDrawer component with tests"
```

---

### Task 7: Layout Orchestration in `AppLayout.tsx` & Integration Testing

**Files:**
- Modify: `apps/admin-web/src/layouts/AppLayout.tsx`
- Modify: `apps/admin-web/src/layouts/__tests__/AppLayout.test.tsx`

**Interfaces:**
- Consumes: `Sidebar`, `Topbar`, `MobileNavDrawer`, `Outlet`, `useAppSelector`, `selectSidebarCollapsed`
- Produces: Updated `AppLayout` shell with responsive padding transitions

- [ ] **Step 1: Update `AppLayout.tsx`**

Update `apps/admin-web/src/layouts/AppLayout.tsx`:
```tsx
import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import {
  selectSidebarCollapsed,
  setMobileNavOpen,
} from '@store/slices/appSlice';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { MobileNavDrawer } from './components/MobileNavDrawer';

export function AppLayout() {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const isCollapsed = useAppSelector(selectSidebarCollapsed);

  // Auto-close mobile drawer on route change
  useEffect(() => {
    dispatch(setMobileNavOpen(false));
  }, [location.pathname, dispatch]);

  // Auto-close mobile drawer if viewport expands to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        dispatch(setMobileNavOpen(false));
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [dispatch]);

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-200">
      {/* Desktop Fixed Sidebar */}
      <Sidebar />

      {/* Mobile Drawer */}
      <MobileNavDrawer />

      {/* Main Content Area offset by Sidebar */}
      <div
        className={`flex flex-col min-h-screen transition-all duration-300 ease-in-out ${
          isCollapsed ? 'md:pl-16' : 'md:pl-64'
        }`}
      >
        <Topbar />
        <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `AppLayout.test.tsx`**

Update `apps/admin-web/src/layouts/__tests__/AppLayout.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import appReducer from '@store/slices/appSlice';
import authReducer from '@store/slices/authSlice';
import { baseApi } from '@store/api/baseApi';
import { AppLayout } from '../AppLayout';

function renderAppLayout(initialPath = '/') {
  const store = configureStore({
    reducer: {
      app: appReducer,
      auth: authReducer,
      [baseApi.reducerPath]: baseApi.reducer,
    },
    preloadedState: {
      app: { theme: 'dark', locale: 'en', sidebarCollapsed: false, mobileNavOpen: false },
      auth: {
        user: { id: 'usr_1', email: 'admin@demo.com', firstName: 'Admin', lastName: null, role: 'admin' },
        tenant: { id: 'tenant-demo', name: 'Demo Store' },
        isAuthenticated: true,
      },
    },
    middleware: (gdm) => gdm().concat(baseApi.middleware),
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
    { initialEntries: [initialPath] },
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
  it('renders sidebar, topbar, search input, and outlet content', () => {
    renderAppLayout();
    expect(screen.getByText('Dashboard Outlet Content')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /products/i })).toBeInTheDocument();
  });

  it('toggles sidebar collapse state on collapse button click', async () => {
    const user = userEvent.setup();
    const { store } = renderAppLayout();

    const toggleBtn = screen.getByRole('button', { name: /collapse sidebar|expand sidebar/i });
    await user.click(toggleBtn);
    expect(store.getState().app.sidebarCollapsed).toBe(true);
  });
});
```

- [ ] **Step 3: Run layout integration tests**

Run: `pnpm --filter @tiny-threads/admin-web test src/layouts/__tests__/AppLayout.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/admin-web/src/layouts/
git commit -m "feat(admin-web): orchestrate Sidebar, Topbar, and MobileNavDrawer in AppLayout"
```

---

### Task 8: Verification, Lint & Build Validation

**Files:**
- None (verification across workspace)

- [ ] **Step 1: Run all admin-web tests**

Run: `pnpm --filter @tiny-threads/admin-web test`
Expected: All tests pass with 0 failures.

- [ ] **Step 2: Run workspace linting**

Run: `pnpm lint`
Expected: Clean exit code 0.

- [ ] **Step 3: Run workspace build**

Run: `pnpm build`
Expected: All packages and applications build successfully.

- [ ] **Step 4: Commit any formatting or lint fixes if necessary**
