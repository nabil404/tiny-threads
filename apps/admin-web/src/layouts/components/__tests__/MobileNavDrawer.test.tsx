import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import appReducer from '@store/slices/appSlice';
import authReducer from '@store/slices/authSlice';
import { baseApi } from '@store/api/baseApi';
import * as authApiModule from '@store/api/endpoints/authApi';
import { MobileNavDrawer } from '../MobileNavDrawer';

function renderMobileDrawer(
  mobileNavOpen = true,
  tenant: { id: string; name: string } | null = { id: 'tenant-demo', name: 'Demo Store' },
) {
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
        mobileNavOpen,
      },
      auth: {
        user: { id: '1', email: 'admin@demo.com', firstName: 'Admin', lastName: null, role: 'admin' },
        tenant,
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
  it('renders nothing when mobileNavOpen is false', () => {
    renderMobileDrawer(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders navigation links and closes on link click', async () => {
    const user = userEvent.setup();
    const { store } = renderMobileDrawer(true);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByText('DS')).toBeInTheDocument();

    const link = screen.getByRole('link', { name: /products/i });
    await user.click(link);
    expect(store.getState().app.mobileNavOpen).toBe(false);
  });

  it('closes on backdrop click', async () => {
    const user = userEvent.setup();
    const { store, container } = renderMobileDrawer(true);

    const backdrop = container.querySelector('.fixed.inset-0');
    expect(backdrop).not.toBeNull();
    await user.click(backdrop!);
    expect(store.getState().app.mobileNavOpen).toBe(false);
  });

  it('closes on close button click', async () => {
    const user = userEvent.setup();
    const { store } = renderMobileDrawer(true);

    const closeBtn = screen.getByRole('button', { name: /close menu/i });
    await user.click(closeBtn);
    expect(store.getState().app.mobileNavOpen).toBe(false);
  });

  it('renders fallback store initials when tenant is null', () => {
    renderMobileDrawer(true, null);
    expect(screen.getByText('TT')).toBeInTheDocument();
    expect(screen.getByText('Tiny Threads')).toBeInTheDocument();
  });

  it('handles logout flow correctly', async () => {
    const user = userEvent.setup();
    const logoutMutationMock = vi.fn().mockReturnValue({
      unwrap: vi.fn().mockResolvedValue({}),
    });
    vi.spyOn(authApiModule, 'useLogoutMutation').mockReturnValue([
      logoutMutationMock,
      { isLoading: false, reset: vi.fn() },
    ] as any);

    const { store } = renderMobileDrawer(true);

    const logoutBtn = screen.getByRole('button', { name: /sign out/i });
    await user.click(logoutBtn);

    expect(logoutMutationMock).toHaveBeenCalled();
    expect(store.getState().auth.isAuthenticated).toBe(false);
    expect(store.getState().app.mobileNavOpen).toBe(false);
  });
});
