import { describe, it, expect, beforeEach } from 'vitest';
import authReducer, {
  loginSuccess,
  logout,
  AUTH_STORAGE_KEY,
  getSavedSession,
  AuthState,
} from '../authSlice';

describe('authSlice', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('initializes with unauthenticated state when localStorage is empty', () => {
    const initialState: AuthState = authReducer(undefined, { type: 'unknown' });
    expect(initialState.isAuthenticated).toBe(false);
    expect(initialState.token).toBe(null);
    expect(initialState.user).toBe(null);
  });

  it('updates state on loginSuccess and persists session flag to localStorage', () => {
    const initialState: AuthState = authReducer(undefined, { type: 'unknown' });
    const payload = {
      user: { id: 'usr_1', email: 'owner@shop.com', name: 'Owner', role: 'owner' },
      tenantId: 'tenant-123',
      token: 'jwt-access-token',
    };

    const nextState = authReducer(initialState, loginSuccess(payload));
    expect(nextState.isAuthenticated).toBe(true);
    expect(nextState.token).toBe('jwt-access-token');
    expect(nextState.user?.email).toBe('owner@shop.com');

    const stored = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || '{}');
    expect(stored.isAuthenticated).toBe(true);
    expect(stored.tenantId).toBe('tenant-123');
    // raw token is NOT stored in localStorage
    expect(stored.token).toBeUndefined();

    const retrieved = getSavedSession();
    expect(retrieved?.isAuthenticated).toBe(true);
    expect(retrieved?.tenantId).toBe('tenant-123');
  });

  it('clears session flag from localStorage on logout', () => {
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        user: { id: 'usr_1', email: 'owner@shop.com', name: 'Owner', role: 'owner' },
        tenantId: 'tenant-123',
        isAuthenticated: true,
      }),
    );

    const activeState: AuthState = {
      user: { id: 'usr_1', email: 'owner@shop.com', name: 'Owner', role: 'owner' },
      tenantId: 'tenant-123',
      token: 'jwt-access-token',
      isAuthenticated: true,
      status: 'succeeded',
      error: null,
    };

    const loggedOutState = authReducer(activeState, logout());
    expect(loggedOutState.isAuthenticated).toBe(false);
    expect(loggedOutState.token).toBe(null);
    expect(localStorage.getItem(AUTH_STORAGE_KEY)).toBe(null);
  });
});
