import { describe, it, expect, vi, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import authReducer, { logout, AuthState } from '../authSlice';
import { authApi } from '../../api/endpoints/authApi';
import { baseApi } from '../../api/baseApi';

function buildStore() {
  return configureStore({
    reducer: {
      auth: authReducer,
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

describe('authSlice', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('initializes with unauthenticated state', () => {
    const initialState: AuthState = authReducer(undefined, {
      type: 'unknown',
    });
    expect(initialState.isAuthenticated).toBe(false);
    expect(initialState.user).toBe(null);
    expect(initialState.tenant).toBe(null);
  });

  it('populates user and tenant when getMe resolves', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchOnce(200, {
        user: {
          id: 'mu-1',
          email: 'owner@shop.com',
          firstName: 'Ada',
          lastName: 'Lovelace',
          role: 'owner',
          locale: 'en',
        },
        tenant: { id: 'tenant-1', name: 'Acme Store' },
      }),
    );
    const store = buildStore();

    await store.dispatch(authApi.endpoints.getMe.initiate());

    const state = store.getState().auth;
    expect(state.isAuthenticated).toBe(true);
    expect(state.user).toEqual({
      id: 'mu-1',
      email: 'owner@shop.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      role: 'owner',
    });
    expect(state.tenant).toEqual({ id: 'tenant-1', name: 'Acme Store' });
  });

  it('clears user and tenant when getMe is rejected', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchOnce(401, { error: { message: 'Unauthorized' } }),
    );
    const store = buildStore();

    await store.dispatch(authApi.endpoints.getMe.initiate());

    const state = store.getState().auth;
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBe(null);
    expect(state.tenant).toBe(null);
  });

  it('resets state on logout', () => {
    const activeState: AuthState = {
      user: {
        id: 'mu-1',
        email: 'owner@shop.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        role: 'owner',
      },
      tenant: { id: 'tenant-1', name: 'Acme Store' },
      isAuthenticated: true,
    };

    const loggedOutState = authReducer(activeState, logout());
    expect(loggedOutState.isAuthenticated).toBe(false);
    expect(loggedOutState.user).toBe(null);
    expect(loggedOutState.tenant).toBe(null);
  });
});
