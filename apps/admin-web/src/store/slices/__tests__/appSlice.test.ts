import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import appReducer, {
  setTheme,
  toggleSidebar,
  setSidebarCollapsed,
  toggleMobileNav,
  setMobileNavOpen,
  selectSidebarCollapsed,
  selectMobileNavOpen,
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  AppState,
} from '../appSlice';
import { THEME_STORAGE_KEY } from '@theme/themes';
import type { RootState } from '../../index';


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


});

describe('appSlice layout actions', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('handles toggleSidebar and persists to localStorage', () => {
    const initialState = {
      theme: 'dark' as const,
      sidebarCollapsed: false,
      mobileNavOpen: false,
    };

    const state1 = appReducer(initialState, toggleSidebar());
    expect(state1.sidebarCollapsed).toBe(true);
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe('true');

    const state2 = appReducer(state1, toggleSidebar());
    expect(state2.sidebarCollapsed).toBe(false);
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe('false');
  });

  it('handles setSidebarCollapsed with explicit value', () => {
    const initialState = {
      theme: 'dark' as const,
      sidebarCollapsed: false,
      mobileNavOpen: false,
    };

    const state = appReducer(initialState, setSidebarCollapsed(true));
    expect(state.sidebarCollapsed).toBe(true);
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)).toBe('true');
  });

  it('handles toggleMobileNav and setMobileNavOpen without localStorage persistence', () => {
    const initialState = {
      theme: 'dark' as const,
      sidebarCollapsed: false,
      mobileNavOpen: false,
    };

    const state1 = appReducer(initialState, toggleMobileNav());
    expect(state1.mobileNavOpen).toBe(true);

    const state2 = appReducer(state1, setMobileNavOpen(false));
    expect(state2.mobileNavOpen).toBe(false);
  });

  it('selects sidebarCollapsed and mobileNavOpen from RootState', () => {
    const mockRootState = {
      app: {
        theme: 'dark' as const,
        sidebarCollapsed: true,
        mobileNavOpen: true,
      },
    } as RootState;

    expect(selectSidebarCollapsed(mockRootState)).toBe(true);
    expect(selectMobileNavOpen(mockRootState)).toBe(true);
  });

  it('initializes sidebarCollapsed from localStorage when set to true', () => {
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, 'true');
    const state: AppState = appReducer(undefined, { type: 'unknown' });
    expect(state.sidebarCollapsed).toBe(true);
  });
});
