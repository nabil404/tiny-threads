import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  ThemeId,
  getSavedTheme,
  applyThemeToDocument,
  THEME_STORAGE_KEY,
} from '../../theme/themes';

export interface AppState {
  tenantId: string | null;
  tenantName: string;
  theme: ThemeId;
}

const initialState: AppState = {
  tenantId: null,
  tenantName: 'Tiny Threads Admin',
  theme: getSavedTheme(),
};

export const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    setTenant: (state, action: PayloadAction<{ id: string; name: string }>) => {
      state.tenantId = action.payload.id;
      state.tenantName = action.payload.name;
    },
    setTheme: (state, action: PayloadAction<ThemeId>) => {
      state.theme = action.payload;
      if (typeof window !== 'undefined') {
        localStorage.setItem(THEME_STORAGE_KEY, action.payload);
      }
      applyThemeToDocument(action.payload);
    },
  },
});

export const { setTenant, setTheme } = appSlice.actions;
export const selectApp = (state: { app: AppState }) => state.app;
export default appSlice.reducer;

