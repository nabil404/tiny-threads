import { describe, it, expect, beforeEach } from 'vitest';
import {
  THEMES,
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  getSavedTheme,
  applyThemeToDocument,
} from '../themes';

describe('Theme Registry', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.className = '';
  });

  it('should export registered themes list with light, dark, midnight, emerald', () => {
    const ids = THEMES.map((t) => t.id);
    expect(ids).toEqual(['light', 'dark', 'midnight', 'emerald']);
  });

  it('should fallback to DEFAULT_THEME when localStorage is empty', () => {
    expect(getSavedTheme()).toBe(DEFAULT_THEME);
  });

  it('should retrieve saved theme from localStorage if valid', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'midnight');
    expect(getSavedTheme()).toBe('midnight');
  });

  it('should fallback to DEFAULT_THEME if stored theme is invalid', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'invalid-theme');
    expect(getSavedTheme()).toBe(DEFAULT_THEME);
  });

  it('should set data-theme attribute on document root', () => {
    applyThemeToDocument('emerald');
    expect(document.documentElement.getAttribute('data-theme')).toBe('emerald');
  });

  it('should add dark class for dark/midnight theme for backward compatibility', () => {
    applyThemeToDocument('midnight');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    applyThemeToDocument('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
