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

export interface AppState {
  theme: ThemeId;
  locale: LocaleId;
}

const initialState: AppState = {
  theme: getSavedTheme(),
  locale: getSavedLocale(),
};

function applyLocale(state: AppState, locale: LocaleId) {
  state.locale = locale;
  if (typeof window !== 'undefined') {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }
  void i18n.changeLanguage(locale);
}

export const appSlice = createSlice({
  name: 'app',
  initialState,
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

export const { setTheme, setLocale } = appSlice.actions;
export const selectApp = (state: { app: AppState }) => state.app;
export default appSlice.reducer;
