import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
      app: {
        theme: 'dark' as const,
        locale: 'en' as const,
        sidebarCollapsed,
        mobileNavOpen: false,
      },
      auth: {
        user: {
          id: '1',
          email: 'admin@demo.com',
          firstName: 'Admin',
          lastName: null,
          role: 'admin',
        },
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
    expect(
      screen.getByRole('link', { name: /categories/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /customers/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /analytics/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /support/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /sign out/i }),
    ).toBeInTheDocument();
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
    await waitFor(() => {
      expect(store.getState().auth.isAuthenticated).toBe(false);
    });
  });

  it('safely parses store initials with extra whitespace and leading/trailing spaces', () => {
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
            id: '1',
            email: 'admin@demo.com',
            firstName: 'Admin',
            lastName: null,
            role: 'admin',
          },
          tenant: { id: 'tenant-demo', name: '   Super   Awesome   Store  ' },
          isAuthenticated: true,
        },
      },
      middleware: (gdm) => gdm().concat(baseApi.middleware),
    });

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/products']}>
          <Sidebar />
        </MemoryRouter>
      </Provider>,
    );

    expect(screen.getByText('SA')).toBeInTheDocument();
  });
});
