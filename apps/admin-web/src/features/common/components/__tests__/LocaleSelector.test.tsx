import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import appReducer, { AppState } from '@store/slices/appSlice';
import authReducer, { AuthState } from '@store/slices/authSlice';
import { baseApi } from '@store/api/baseApi';
import * as localeApiHooks from '@store/api/endpoints/localeApi';
import { LocaleSelector } from '../LocaleSelector';

function createMockStore(isAuthenticated = true) {
  const app: AppState = {
    theme: 'dark',
    locale: 'en',
    sidebarCollapsed: false,
    mobileNavOpen: false,
  };
  const auth: AuthState = {
    user: isAuthenticated
      ? {
          id: 'usr_1',
          email: 'admin@shop.com',
          firstName: 'Admin',
          lastName: null,
          role: 'admin',
        }
      : null,
    tenant: isAuthenticated ? { id: 'tenant-1', name: 'Test Tenant' } : null,
    isAuthenticated,
  };

  return configureStore({
    reducer: {
      app: appReducer,
      auth: authReducer,
      [baseApi.reducerPath]: baseApi.reducer,
    },
    preloadedState: { app, auth },
    middleware: (gDM) => gDM().concat(baseApi.middleware),
  });
}

describe('LocaleSelector (Smart Component connected to Redux)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders active locale from Redux state', () => {
    const store = createMockStore();
    render(
      <Provider store={store}>
        <LocaleSelector />
      </Provider>,
    );

    const button = screen.getByRole('button', { name: /select language/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('English');
  });

  it('dispatches setLocale to Redux and persists via the mutation when a locale is selected', async () => {
    const mockUnwrap = vi.fn().mockResolvedValue({ locale: 'en' });
    const mockUpdateMutation = vi.fn().mockReturnValue({ unwrap: mockUnwrap });
    vi.spyOn(localeApiHooks, 'useUpdateLocaleMutation').mockReturnValue([
      mockUpdateMutation as any,
      { isLoading: false } as any,
    ]);

    const store = createMockStore(true);
    render(
      <Provider store={store}>
        <LocaleSelector />
      </Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /select language/i }));
    fireEvent.click(screen.getByRole('button', { name: /^english/i }));

    expect(store.getState().app.locale).toBe('en');
    await waitFor(() => {
      expect(mockUpdateMutation).toHaveBeenCalledWith({ locale: 'en' });
    });
  });

  it('does not call the mutation when user is not authenticated', async () => {
    const mockUpdateMutation = vi.fn();
    vi.spyOn(localeApiHooks, 'useUpdateLocaleMutation').mockReturnValue([
      mockUpdateMutation as any,
      { isLoading: false } as any,
    ]);

    const store = createMockStore(false);
    render(
      <Provider store={store}>
        <LocaleSelector />
      </Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /select language/i }));
    fireEvent.click(screen.getByRole('button', { name: /^english/i }));

    expect(store.getState().app.locale).toBe('en');
    expect(mockUpdateMutation).not.toHaveBeenCalled();
  });
});
