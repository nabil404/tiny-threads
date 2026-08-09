import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  ThemeId,
  getSavedTheme,
  applyThemeToDocument,
  THEME_STORAGE_KEY,
} from '../../theme/themes';
import i18n from '../../i18n';
import { LocaleId, getSavedLocale, LOCALE_STORAGE_KEY } from '../../i18n/locales';

export interface AppState {
  tenantId: string | null;
  tenantName: string;
  theme: ThemeId;
  locale: LocaleId;
}

const initialState: AppState = {
  tenantId: null,
  tenantName: 'Tiny Threads Admin',
  theme: getSavedTheme(),
  locale: getSavedLocale(),
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
    setLocale: (state, action: PayloadAction<LocaleId>) => {
      state.locale = action.payload;
      if (typeof window !== 'undefined') {
        localStorage.setItem(LOCALE_STORAGE_KEY, action.payload);
      }
      void i18n.changeLanguage(action.payload);
    },
  },
});

export const { setTenant, setTheme, setLocale } = appSlice.actions;
export const selectApp = (state: { app: AppState }) => state.app;
export default appSlice.reducer;

