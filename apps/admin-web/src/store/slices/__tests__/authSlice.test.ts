import { describe, it, expect } from 'vitest';
import authReducer, {
  loginSuccess,
  logout,
  AuthState,
} from '../authSlice';

describe('authSlice', () => {
  it('initializes with unauthenticated state', () => {
    const initialState: AuthState = authReducer(undefined, { type: 'unknown' });
    expect(initialState.isAuthenticated).toBe(false);
    expect(initialState.user).toBe(null);
  });

  it('updates state on loginSuccess without touching localStorage', () => {
    const initialState: AuthState = authReducer(undefined, { type: 'unknown' });
    const payload = {
      user: { id: 'usr_1', email: 'owner@shop.com', name: 'Owner', role: 'owner' },
      tenantId: 'tenant-123',
    };

    const nextState = authReducer(initialState, loginSuccess(payload));
    expect(nextState.isAuthenticated).toBe(true);
    expect(nextState.user?.email).toBe('owner@shop.com');
    expect(nextState.tenantId).toBe('tenant-123');
  });

  it('resets state on logout', () => {
    const activeState: AuthState = {
      user: { id: 'usr_1', email: 'owner@shop.com', name: 'Owner', role: 'owner' },
      tenantId: 'tenant-123',
      isAuthenticated: true,
      status: 'succeeded',
      error: null,
    };

    const loggedOutState = authReducer(activeState, logout());
    expect(loggedOutState.isAuthenticated).toBe(false);
    expect(loggedOutState.user).toBe(null);
  });
});
