import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  ThemeId,
  getSavedTheme,
  applyThemeToDocument,
  THEME_STORAGE_KEY,
} from '../../theme/themes';
import i18n from '../../i18n';
import {
  LocaleId,
  getSavedLocale,
  LOCALE_STORAGE_KEY,
} from '../../i18n/locales';

export const TENANT_STORAGE_KEY = 'tiny_threads_admin_tenant';

export interface AppState {
  tenantId: string | null;
  tenantName: string;
  theme: ThemeId;
  locale: LocaleId;
}

export function getSavedTenant(): { id: string | null; name: string } {
  if (typeof window === 'undefined') {
    return { id: null, name: 'Tiny Threads Admin' };
  }
  try {
    const raw = localStorage.getItem(TENANT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.name === 'string') {
        return { id: parsed.id ?? null, name: parsed.name };
      }
    }
  } catch {
    // ignore parse error
  }
  return { id: null, name: 'Tiny Threads Admin' };
}

const savedTenant = getSavedTenant();

const initialState: AppState = {
  tenantId: savedTenant.id,
  tenantName: savedTenant.name,
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
      if (typeof window !== 'undefined') {
        localStorage.setItem(TENANT_STORAGE_KEY, JSON.stringify(action.payload));
      }
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
