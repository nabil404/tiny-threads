import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import authReducer from '@store/slices/authSlice';
import appReducer from '@store/slices/appSlice';
import { baseApi } from '@store/api/baseApi';
import * as authApiHooks from '@store/api/endpoints/authApi';
import type { GetMeResponse } from '@store/api/endpoints/authApi';
import { RequireAuth, PublicOnlyRoute } from '../index';

function renderWithAuth(
  initialEntries: (string | { pathname: string; state?: unknown })[],
  isAuthenticated: boolean,
  isLoading = false,
) {
  vi.spyOn(authApiHooks, 'useGetMeQuery').mockReturnValue({
    data: isAuthenticated
      ? ({
          user: {
            id: 'usr_1',
            email: 'owner@shop.com',
            firstName: null,
            lastName: null,
            role: 'owner',
            locale: null,
          },
          tenant: {
            id: 'tenant-1',
            name: 'Test Tenant',
          },
        } satisfies GetMeResponse)
      : undefined,
    isLoading,
    isError: !isAuthenticated && !isLoading,
    refetch: vi.fn(),
  } as any);

  const store = configureStore({
    reducer: {
      auth: authReducer,
      app: appReducer,
      [baseApi.reducerPath]: baseApi.reducer,
    },
    middleware: (gDM) => gDM().concat(baseApi.middleware),
  });

  const router = createMemoryRouter(
    [
      {
        element: <RequireAuth />,
        children: [
          { path: '/protected', element: <div>Protected Page</div> },
          { path: '/dashboard', element: <div>Dashboard Page</div> },
        ],
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
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('RequireAuth renders loading state while session verification is in progress', () => {
    renderWithAuth(['/protected'], false, true);
    expect(screen.getByText(/verifying session/i)).toBeInTheDocument();
  });

  it('RequireAuth redirects unauthenticated user to /login', () => {
    renderWithAuth(['/protected'], false);
    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Protected Page')).not.toBeInTheDocument();
  });

  it('RequireAuth renders child route when authenticated', () => {
    renderWithAuth(['/protected'], true);
    expect(screen.getByText('Protected Page')).toBeInTheDocument();
  });

  it('PublicOnlyRoute redirects authenticated user to / by default', () => {
    renderWithAuth(['/login'], true);
    expect(screen.getByText('Home Page')).toBeInTheDocument();
  });

  it('PublicOnlyRoute redirects authenticated user to state.from location when provided', () => {
    renderWithAuth(
      [
        {
          pathname: '/login',
          state: { from: { pathname: '/dashboard' } },
        },
      ],
      true,
    );
    expect(screen.getByText('Dashboard Page')).toBeInTheDocument();
  });

  it('PublicOnlyRoute redirects authenticated user to state.from location with search parameters when provided', () => {
    renderWithAuth(
      [
        {
          pathname: '/login',
          state: { from: { pathname: '/dashboard', search: '?tab=settings' } },
        },
      ],
      true,
    );
    expect(screen.getByText('Dashboard Page')).toBeInTheDocument();
  });

  it('PublicOnlyRoute renders login page when unauthenticated', () => {
    renderWithAuth(['/login'], false);
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });
});
