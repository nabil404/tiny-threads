import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import appReducer, { AppState } from '@store/slices/appSlice';
import authReducer, { AuthState } from '@store/slices/authSlice';
import { LocaleSelector } from '../LocaleSelector';
import { updateLocale } from '@lib/api-client';

vi.mock('@lib/api-client', () => ({
  updateLocale: vi.fn(),
}));

function createMockStore(token: string | null = 'jwt-abc') {
  const app: AppState = {
    tenantId: 'tenant-1',
    tenantName: 'Test Tenant',
    theme: 'dark',
    locale: 'en',
  };
  const auth: AuthState = {
    user: null,
    tenantId: 'tenant-1',
    token,
    isAuthenticated: Boolean(token),
    isInitialized: true,
    status: 'idle',
    error: null,
  };

  return configureStore({
    reducer: { app: appReducer, auth: authReducer },
    preloadedState: { app, auth },
  });
}

describe('LocaleSelector (Smart Component connected to Redux)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(updateLocale).mockReset();
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

  it('dispatches setLocale to Redux and persists via the API client when a locale is selected', async () => {
    vi.mocked(updateLocale).mockResolvedValue({ locale: 'en' });
    const store = createMockStore('jwt-abc');
    render(
      <Provider store={store}>
        <LocaleSelector />
      </Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /select language/i }));
    fireEvent.click(screen.getByRole('button', { name: /english/i }));

    expect(store.getState().app.locale).toBe('en');
    await waitFor(() => {
      expect(updateLocale).toHaveBeenCalledWith('jwt-abc', 'en');
    });
  });

  it('keeps the optimistic locale change even when the persistence call rejects', async () => {
    vi.mocked(updateLocale).mockRejectedValue(new Error('network down'));
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const store = createMockStore('jwt-abc');
    render(
      <Provider store={store}>
        <LocaleSelector />
      </Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /select language/i }));
    fireEvent.click(screen.getByRole('button', { name: /english/i }));

    await waitFor(() => {
      expect(updateLocale).toHaveBeenCalled();
    });
    expect(store.getState().app.locale).toBe('en');
    consoleErrorSpy.mockRestore();
  });

  it('does not call the API client when there is no auth token', async () => {
    const store = createMockStore(null);
    render(
      <Provider store={store}>
        <LocaleSelector />
      </Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /select language/i }));
    fireEvent.click(screen.getByRole('button', { name: /english/i }));

    expect(store.getState().app.locale).toBe('en');
    expect(updateLocale).not.toHaveBeenCalled();
  });
});
