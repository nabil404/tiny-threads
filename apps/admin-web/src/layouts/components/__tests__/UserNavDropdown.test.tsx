import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
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
      app: { theme: 'dark' as const, locale: 'en' as const, sidebarCollapsed: false, mobileNavOpen: false },
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
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route path="/dashboard" element={<UserNavDropdown />} />
            <Route path="/login" element={<div>Login Page</div>} />
            <Route path="/settings" element={<div>Settings Page</div>} />
          </Routes>
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

  it('renders fallback initials when user has no first or last name', async () => {
    renderDropdown({
      user: {
        id: 'usr_2',
        email: 'user@example.com',
        firstName: null,
        lastName: null,
        role: 'staff',
      },
    });

    expect(screen.getByText('U')).toBeInTheDocument();
  });

  it('handles sign-out correctly', async () => {
    const user = userEvent.setup();
    const { store } = renderDropdown();

    const trigger = screen.getByRole('button', { name: /user menu/i });
    await user.click(trigger);

    const signOutBtn = screen.getByRole('button', { name: /sign out/i });
    await user.click(signOutBtn);

    await waitFor(() => {
      expect(store.getState().auth.isAuthenticated).toBe(false);
      expect(store.getState().auth.user).toBeNull();
    });
    expect(await screen.findByText('Login Page')).toBeInTheDocument();
  });

  it('closes dropdown when clicking outside', async () => {
    const user = userEvent.setup();
    renderDropdown();

    const trigger = screen.getByRole('button', { name: /user menu/i });
    await user.click(trigger);
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();

    await user.click(document.body);
    expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument();
  });
});
