import { describe, it, expect, beforeEach } from 'vitest';
import appReducer, { setTheme, setTenant, setLocale, AppState } from '../appSlice';
import { THEME_STORAGE_KEY } from '@theme/themes';
import { LOCALE_STORAGE_KEY } from '@i18n/locales';
import i18n from '@i18n';

describe('appSlice', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
  });

  it('should initialize state with default theme from getSavedTheme()', () => {
    const initialState: AppState = appReducer(undefined, { type: 'unknown' });
    expect(initialState.theme).toBe('dark');
    expect(initialState.tenantName).toBe('Tiny Threads Admin');
  });

  it('should handle setTenant', () => {
    const initialState: AppState = appReducer(undefined, { type: 'unknown' });
    const nextState = appReducer(
      initialState,
      setTenant({ id: 'tenant-123', name: 'Acme Store' }),
    );
    expect(nextState.tenantId).toBe('tenant-123');
    expect(nextState.tenantName).toBe('Acme Store');
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
});
