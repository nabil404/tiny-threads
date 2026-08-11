import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import appReducer from '@store/slices/appSlice';
import authReducer from '@store/slices/authSlice';
import { baseApi } from '@store/api/baseApi';
import { AppLayout } from '../AppLayout';

function renderAppLayout({
  tenantId = 'tenant-demo',
  tenantName = 'Demo Store',
  user = {
    id: 'usr_1',
    email: 'admin@demo.com',
    name: 'Admin',
    role: 'admin',
  } as {
    id: string;
    email: string;
    name: string;
    role: string;
  } | null,
  initialPath = '/',
} = {}) {
  const store = configureStore({
    reducer: {
      app: appReducer,
      auth: authReducer,
      [baseApi.reducerPath]: baseApi.reducer,
    },
    preloadedState: {
      app: {
        tenantId,
        tenantName,
        theme: 'dark' as const,
        locale: 'en' as const,
      },
      auth: {
        user,
        tenantId,
        token: 'tok-123',
        isAuthenticated: true,
        status: 'succeeded' as const,
        error: null,
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
          { path: '/orders', element: <div>Orders Outlet Content</div> },
          { path: '/settings', element: <div>Settings Outlet Content</div> },
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
  it('renders store header, tenant badge, navigation links, and outlet content', () => {
    renderAppLayout();
    expect(screen.getByText('Demo Store')).toBeInTheDocument();
    expect(screen.getByText('Dashboard Outlet Content')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /dashboard/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /products/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /orders/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument();
    expect(screen.getByText('admin@demo.com')).toBeInTheDocument();
  });

  it('renders platform context badge when tenantId is null', () => {
    renderAppLayout({
      tenantId: null as unknown as string,
      tenantName: 'Platform Console',
    });
    expect(screen.getByText(/Platform Context/i)).toBeInTheDocument();
  });

  it('dispatches logout action when log out button is clicked', async () => {
    const user = userEvent.setup();
    const { store } = renderAppLayout();
    const logoutBtn = screen.getByRole('button', { name: /log out/i });
    await user.click(logoutBtn);
    await waitFor(() => {
      expect(store.getState().auth.isAuthenticated).toBe(false);
    });
  });
});
