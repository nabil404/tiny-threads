import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import appReducer, { AppState } from '@store/slices/appSlice';
import authReducer, { AuthState } from '@store/slices/authSlice';
import App from '../App';
import { getLocale } from '@lib/api-client';

vi.mock('@lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@lib/api-client')>('@lib/api-client');
  return { ...actual, getLocale: vi.fn() };
});

function createAuthenticatedStore() {
  const app: AppState = {
    tenantId: 'tenant-1',
    tenantName: 'Acme Store',
    theme: 'dark',
    locale: 'en',
  };
  const auth: AuthState = {
    user: { id: 'usr_1', email: 'owner@acme.dev', name: 'Owner', role: 'owner' },
    tenantId: 'tenant-1',
    token: 'tok',
    isAuthenticated: true,
    status: 'succeeded',
    error: null,
  };

  return configureStore({
    reducer: { app: appReducer, auth: authReducer },
    preloadedState: { app, auth },
  });
}

describe('App (authenticated)', () => {
  beforeEach(() => {
    vi.mocked(getLocale).mockReset();
  });

  it('renders translated console subtitle and tenant badge from i18n', () => {
    vi.mocked(getLocale).mockResolvedValue({ locale: null });
    const store = createAuthenticatedStore();
    render(
      <Provider store={store}>
        <App />
      </Provider>,
    );

    expect(
      screen.getByText('Merchant Administration Console'),
    ).toBeInTheDocument();
    expect(screen.getByText('Tenant: tenant-1')).toBeInTheDocument();
  });

  it('hydrates the locale from the backend on mount when already authenticated', async () => {
    vi.mocked(getLocale).mockResolvedValue({ locale: 'en' });
    const store = createAuthenticatedStore();
    render(
      <Provider store={store}>
        <App />
      </Provider>,
    );

    await waitFor(() => {
      expect(getLocale).toHaveBeenCalledWith('tok');
    });
    expect(store.getState().app.locale).toBe('en');
  });
});
