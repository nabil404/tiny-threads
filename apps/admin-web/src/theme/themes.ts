export type ThemeId = 'light' | 'dark' | 'midnight' | 'emerald' | string;

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  description: string;
  iconName: 'Sun' | 'Moon' | 'Sparkles' | 'Trees';
}

export const THEMES: ThemeConfig[] = [
  {
    id: 'light',
    name: 'Light',
    description: 'Clean light palette',
    iconName: 'Sun',
  },
  {
    id: 'dark',
    name: 'Dark',
    description: 'Classic dark mode',
    iconName: 'Moon',
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Deep navy & purple night theme',
    iconName: 'Sparkles',
  },
  {
    id: 'emerald',
    name: 'Emerald',
    description: 'Rich dark slate & mint theme',
    iconName: 'Trees',
  },
];

export const DEFAULT_THEME: ThemeId = 'dark';
export const THEME_STORAGE_KEY = 'tiny_threads_admin_theme';

export function getSavedTheme(): ThemeId {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved && THEMES.some((t) => t.id === saved)) {
    return saved;
  }
  return DEFAULT_THEME;
}

export function applyThemeToDocument(themeId: ThemeId): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', themeId);

  if (themeId === 'dark' || themeId === 'midnight') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}
