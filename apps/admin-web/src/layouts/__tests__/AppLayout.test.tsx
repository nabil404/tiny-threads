import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import appReducer, { setMobileNavOpen } from '@store/slices/appSlice';
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
      app: {
        theme: 'dark' as const,
        locale: 'en' as const,
        sidebarCollapsed: false,
        mobileNavOpen: false,
      },
      auth: {
        user: {
          id: 'usr_1',
          email: 'admin@demo.com',
          firstName: 'Admin',
          lastName: null,
          role: 'admin',
        },
        tenant: { id: 'tenant-demo', name: 'Demo Store' },
        isAuthenticated: true,
      },
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(baseApi.middleware),
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
      { path: '/login', element: <div>Login Page</div> },
    ],
    { initialEntries: [initialPath] },
  );

  return {
    store,
    router,
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

    const toggleBtn = screen.getByRole('button', {
      name: /collapse sidebar|expand sidebar/i,
    });
    await user.click(toggleBtn);
    expect(store.getState().app.sidebarCollapsed).toBe(true);
  });

  it('auto-closes mobile drawer on route change', async () => {
    const { store, router } = renderAppLayout('/');
    act(() => {
      store.dispatch(setMobileNavOpen(true));
    });
    expect(store.getState().app.mobileNavOpen).toBe(true);

    await act(async () => {
      await router.navigate('/products');
    });

    expect(store.getState().app.mobileNavOpen).toBe(false);
  });

  it('auto-closes mobile drawer on viewport resize to desktop width', () => {
    const { store } = renderAppLayout();
    act(() => {
      store.dispatch(setMobileNavOpen(true));
    });
    expect(store.getState().app.mobileNavOpen).toBe(true);

    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(store.getState().app.mobileNavOpen).toBe(false);
  });
});
