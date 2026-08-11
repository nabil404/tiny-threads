import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import appReducer, { setTheme, setLocale, AppState } from '../appSlice';
import { authApi } from '../../api/endpoints/authApi';
import { baseApi } from '../../api/baseApi';
import { THEME_STORAGE_KEY } from '@theme/themes';
import { LOCALE_STORAGE_KEY } from '@i18n/locales';
import i18n from '@i18n';

function buildStore() {
  return configureStore({
    reducer: {
      app: appReducer,
      [baseApi.reducerPath]: baseApi.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(baseApi.middleware),
  });
}

function mockFetchOnce(status: number, body: unknown) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

describe('appSlice', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should initialize state with default theme from getSavedTheme()', () => {
    const initialState: AppState = appReducer(undefined, { type: 'unknown' });
    expect(initialState.theme).toBe('dark');
  });

  it('should handle setTheme and update localStorage & document attribute', () => {
    const initialState: AppState = appReducer(undefined, { type: 'unknown' });
    const nextState = appReducer(initialState, setTheme('light'));

    expect(nextState.theme).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('should initialize state with default locale from getSavedLocale()', () => {
    const initialState: AppState = appReducer(undefined, { type: 'unknown' });
    expect(initialState.locale).toBe('en');
  });

  it('should handle setLocale and update localStorage & i18next language', () => {
    const initialState: AppState = appReducer(undefined, { type: 'unknown' });
    const nextState = appReducer(initialState, setLocale('en'));

    expect(nextState.locale).toBe('en');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
    expect(i18n.language).toBe('en');
  });

  it('applies the locale returned by getMe', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchOnce(200, {
        user: {
          id: 'mu-1',
          email: 'owner@shop.com',
          firstName: null,
          lastName: null,
          role: 'owner',
          locale: 'en',
        },
        tenant: { id: 'tenant-1', name: 'Acme Store' },
      }),
    );
    const store = buildStore();

    await store.dispatch(authApi.endpoints.getMe.initiate());

    expect(store.getState().app.locale).toBe('en');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
  });

  it('ignores a null locale from getMe', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchOnce(200, {
        user: {
          id: 'mu-1',
          email: 'owner@shop.com',
          firstName: null,
          lastName: null,
          role: 'owner',
          locale: null,
        },
        tenant: { id: 'tenant-1', name: 'Acme Store' },
      }),
    );
    const store = buildStore();
    const before = store.getState().app.locale;

    await store.dispatch(authApi.endpoints.getMe.initiate());

    expect(store.getState().app.locale).toBe(before);
  });
});
