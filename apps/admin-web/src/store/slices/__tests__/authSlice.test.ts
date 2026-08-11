import { describe, it, expect } from 'vitest';
import authReducer, {
  loginSuccess,
  logout,
  setInitialized,
  AuthState,
} from '../authSlice';

describe('authSlice', () => {
  it('initializes with unauthenticated, uninitialized state without reading from localStorage', () => {
    const initialState: AuthState = authReducer(undefined, { type: 'unknown' });
    expect(initialState.isAuthenticated).toBe(false);
    expect(initialState.isInitialized).toBe(false);
    expect(initialState.token).toBe(null);
    expect(initialState.user).toBe(null);
  });

  it('updates state on loginSuccess and marks initialized', () => {
    const initialState: AuthState = authReducer(undefined, { type: 'unknown' });
    const payload = {
      user: { id: 'usr_1', email: 'owner@shop.com', name: 'Owner', role: 'owner' },
      tenantId: 'tenant-123',
      token: 'jwt-access-token',
    };

    const nextState = authReducer(initialState, loginSuccess(payload));
    expect(nextState.isAuthenticated).toBe(true);
    expect(nextState.isInitialized).toBe(true);
    expect(nextState.token).toBe('jwt-access-token');
    expect(nextState.user?.email).toBe('owner@shop.com');
  });

  it('clears session on logout and keeps initialized true', () => {
    const activeState: AuthState = {
      user: { id: 'usr_1', email: 'owner@shop.com', name: 'Owner', role: 'owner' },
      tenantId: 'tenant-123',
      token: 'jwt-access-token',
      isAuthenticated: true,
      isInitialized: true,
      status: 'succeeded',
      error: null,
    };

    const loggedOutState = authReducer(activeState, logout());
    expect(loggedOutState.isAuthenticated).toBe(false);
    expect(loggedOutState.isInitialized).toBe(true);
    expect(loggedOutState.token).toBe(null);
  });

  it('updates isInitialized on setInitialized action', () => {
    const initialState: AuthState = authReducer(undefined, { type: 'unknown' });
    const nextState = authReducer(initialState, setInitialized(true));
    expect(nextState.isInitialized).toBe(true);
  });
});
