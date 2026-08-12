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
  LOCALES,
} from '../../i18n/locales';
import { authApi } from '../api/endpoints/authApi';

export const SIDEBAR_COLLAPSED_STORAGE_KEY = 'tiny_threads_sidebar_collapsed';

export interface AppState {
  theme: ThemeId;
  locale: LocaleId;
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
}

const getInitialSidebarCollapsed = (): boolean => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
};

const getInitialState = (): AppState => ({
  theme: getSavedTheme(),
  locale: getSavedLocale(),
  sidebarCollapsed: getInitialSidebarCollapsed(),
  mobileNavOpen: false,
});

function applyLocale(state: AppState, locale: LocaleId) {
  state.locale = locale;
  if (typeof window !== 'undefined') {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }
  void i18n.changeLanguage(locale);
}

export const appSlice = createSlice({
  name: 'app',
  initialState: getInitialState,
  reducers: {
    setTheme: (state, action: PayloadAction<ThemeId>) => {
      state.theme = action.payload;
      if (typeof window !== 'undefined') {
        localStorage.setItem(THEME_STORAGE_KEY, action.payload);
      }
      applyThemeToDocument(action.payload);
    },
    setLocale: (state, action: PayloadAction<LocaleId>) => {
      applyLocale(state, action.payload);
    },
    toggleSidebar: (state) => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
      if (typeof window !== 'undefined') {
        localStorage.setItem(
          SIDEBAR_COLLAPSED_STORAGE_KEY,
          String(state.sidebarCollapsed),
        );
      }
    },
    setSidebarCollapsed: (state, action: PayloadAction<boolean>) => {
      state.sidebarCollapsed = action.payload;
      if (typeof window !== 'undefined') {
        localStorage.setItem(
          SIDEBAR_COLLAPSED_STORAGE_KEY,
          String(action.payload),
        );
      }
    },
    toggleMobileNav: (state) => {
      state.mobileNavOpen = !state.mobileNavOpen;
    },
    setMobileNavOpen: (state, action: PayloadAction<boolean>) => {
      state.mobileNavOpen = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addMatcher(
      authApi.endpoints.getMe.matchFulfilled,
      (state, action) => {
        const { locale } = action.payload.user;
        if (locale && LOCALES.some((l) => l.id === locale)) {
          applyLocale(state, locale as LocaleId);
        }
      },
    );
  },
});

export const {
  setTheme,
  setLocale,
  toggleSidebar,
  setSidebarCollapsed,
  toggleMobileNav,
  setMobileNavOpen,
} = appSlice.actions;

export const selectApp = (state: { app: AppState }) => state.app;
export const selectTheme = (state: { app: AppState }) => state.app.theme;
export const selectLocale = (state: { app: AppState }) => state.app.locale;
export const selectSidebarCollapsed = (state: { app: AppState }) =>
  state.app.sidebarCollapsed;
export const selectMobileNavOpen = (state: { app: AppState }) =>
  state.app.mobileNavOpen;

export default appSlice.reducer;

