import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import authReducer, { AuthState } from '@store/slices/authSlice';
import appReducer from '@store/slices/appSlice';
import { RequireAuth, PublicOnlyRoute } from '../index';

function renderWithAuth(
  initialEntries: (string | { pathname: string; state?: unknown })[],
  isAuthenticated: boolean,
) {
  const authState: AuthState = {
    user: isAuthenticated ? { id: '1', email: 'a@b.com', name: 'User', role: 'admin' } : null,
    tenantId: isAuthenticated ? 'tenant-1' : null,
    token: isAuthenticated ? 'valid-token' : null,
    isAuthenticated,
    status: 'idle',
    error: null,
  };

  const store = configureStore({
    reducer: { auth: authReducer, app: appReducer },
    preloadedState: {
      auth: authState,
    },
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

  it('PublicOnlyRoute renders login page when unauthenticated', () => {
    renderWithAuth(['/login'], false);
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });
});
