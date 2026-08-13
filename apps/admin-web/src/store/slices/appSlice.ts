import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  ThemeId,
  getSavedTheme,
  applyThemeToDocument,
  THEME_STORAGE_KEY,
} from '../../theme/themes';

export const SIDEBAR_COLLAPSED_STORAGE_KEY = 'tiny_threads_sidebar_collapsed';

export interface AppState {
  theme: ThemeId;
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
}

const getInitialSidebarCollapsed = (): boolean => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
};

const getInitialState = (): AppState => ({
  theme: getSavedTheme(),
  sidebarCollapsed: getInitialSidebarCollapsed(),
  mobileNavOpen: false,
});



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

});

export const {
  setTheme,
  toggleSidebar,
  setSidebarCollapsed,
  toggleMobileNav,
  setMobileNavOpen,
} = appSlice.actions;

export const selectApp = (state: { app: AppState }) => state.app;
export const selectTheme = (state: { app: AppState }) => state.app.theme;
export const selectSidebarCollapsed = (state: { app: AppState }) =>
  state.app.sidebarCollapsed;
export const selectMobileNavOpen = (state: { app: AppState }) =>
  state.app.mobileNavOpen;

export default appSlice.reducer;
