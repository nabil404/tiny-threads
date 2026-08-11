import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../index';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface AuthState {
  user: AuthUser | null;
  tenantId: string | null;
  token: string | null;
  isAuthenticated: boolean;
  isInitialized: boolean;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  tenantId: null,
  token: null,
  isAuthenticated: false,
  isInitialized: false,
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
      state.isInitialized = true;
      state.error = null;
    },
    loginFailure: (state, action: PayloadAction<string>) => {
      state.status = 'failed';
      state.error = action.payload;
      state.isInitialized = true;
    },
    setInitialized: (state, action: PayloadAction<boolean>) => {
      state.isInitialized = action.payload;
    },
    logout: (state) => {
      state.user = null;
      state.tenantId = null;
      state.token = null;
      state.isAuthenticated = false;
      state.isInitialized = true;
      state.status = 'idle';
      state.error = null;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
});

export const {
  loginStart,
  loginSuccess,
  loginFailure,
  setInitialized,
  logout,
  clearError,
} = authSlice.actions;

export const selectAuth = (state: RootState) => state.auth;

export default authSlice.reducer;
