import { describe, it, expect, beforeEach } from 'vitest';
import appReducer, { setTheme, setTenant, AppState } from '../appSlice';
import { THEME_STORAGE_KEY } from '@theme/themes';

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
});
