import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface AppState {
  tenantId: string | null;
  tenantName: string;
  theme: 'light' | 'dark';
}

const initialState: AppState = {
  tenantId: null,
  tenantName: 'Tiny Threads Admin',
  theme: 'dark',
};

export const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    setTenant: (state, action: PayloadAction<{ id: string; name: string }>) => {
      state.tenantId = action.payload.id;
      state.tenantName = action.payload.name;
    },
    toggleTheme: (state) => {
      state.theme = state.theme === 'light' ? 'dark' : 'light';
    },
  },
});

export const { setTenant, toggleTheme } = appSlice.actions;
export const selectApp = (state: { app: AppState }) => state.app;
export default appSlice.reducer;
