import { describe, it, expect, beforeEach } from 'vitest';
import authReducer, {
  loginSuccess,
  logout,
  AUTH_STORAGE_KEY,
  getSavedAuth,
  AuthState,
} from '../authSlice';

describe('authSlice session persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists session to localStorage on loginSuccess and retrieves with getSavedAuth', () => {
    const initialState: AuthState = authReducer(undefined, { type: 'unknown' });
    const payload = {
      user: { id: 'usr_1', email: 'owner@shop.com', name: 'Owner', role: 'owner' },
      tenantId: 'tenant-123',
      token: 'jwt-access-token',
    };

    const nextState = authReducer(initialState, loginSuccess(payload));
    expect(nextState.isAuthenticated).toBe(true);
    expect(nextState.token).toBe('jwt-access-token');

    const stored = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || '{}');
    expect(stored.token).toBe('jwt-access-token');
    expect(stored.tenantId).toBe('tenant-123');
    expect(stored.user.email).toBe('owner@shop.com');

    const retrieved = getSavedAuth();
    expect(retrieved?.token).toBe('jwt-access-token');
  });

  it('clears localStorage on logout', () => {
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        user: { id: 'usr_1', email: 'owner@shop.com', name: 'Owner', role: 'owner' },
        tenantId: 'tenant-123',
        token: 'jwt-access-token',
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
