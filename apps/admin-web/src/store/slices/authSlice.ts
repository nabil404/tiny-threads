import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../index';

export const AUTH_STORAGE_KEY = 'tiny_threads_admin_session';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface StoredSession {
  user: AuthUser | null;
  tenantId: string | null;
  isAuthenticated: boolean;
}

export interface AuthState {
  user: AuthUser | null;
  tenantId: string | null;
  token: string | null;
  isAuthenticated: boolean;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

export function getSavedSession(): StoredSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.isAuthenticated === 'boolean') {
        return parsed;
      }
    }
  } catch {
    // ignore parse error
  }
  return null;
}

const savedSession = getSavedSession();

const initialState: AuthState = {
  user: savedSession?.user ?? null,
  tenantId: savedSession?.tenantId ?? null,
  token: null,
  isAuthenticated: savedSession?.isAuthenticated ?? false,
  status: 'idle',
  error: null,
};

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    loginStart: (state) => {
      state.status = 'loading';
      state.error = null;
    },
    loginSuccess: (
      state,
      action: PayloadAction<{
        user: AuthUser;
        tenantId: string;
        token: string;
      }>,
    ) => {
      state.status = 'succeeded';
      state.user = action.payload.user;
      state.tenantId = action.payload.tenantId;
      state.token = action.payload.token;
      state.isAuthenticated = true;
      state.error = null;
      if (typeof window !== 'undefined') {
        localStorage.setItem(
          AUTH_STORAGE_KEY,
          JSON.stringify({
            user: action.payload.user,
            tenantId: action.payload.tenantId,
            isAuthenticated: true,
          }),
        );
      }
    },
    loginFailure: (state, action: PayloadAction<string>) => {
      state.status = 'failed';
      state.error = action.payload;
    },
    logout: (state) => {
      state.user = null;
      state.tenantId = null;
      state.token = null;
      state.isAuthenticated = false;
      state.status = 'idle';
      state.error = null;
      if (typeof window !== 'undefined') {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    },
    clearError: (state) => {
      state.error = null;
    },
  },
});

export const { loginStart, loginSuccess, loginFailure, logout, clearError } =
  authSlice.actions;

export const selectAuth = (state: RootState) => state.auth;

export default authSlice.reducer;
