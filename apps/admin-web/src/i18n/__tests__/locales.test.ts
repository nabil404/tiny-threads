import { describe, it, expect, beforeEach } from 'vitest';
import {
  LOCALES,
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  getSavedLocale,
} from '../locales';

describe('Locale Registry', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should export registered locales list with en, es, fr, ar', () => {
    const ids = LOCALES.map((l) => l.id);
    expect(ids).toEqual(['en', 'es', 'fr', 'ar']);
  });

  it('should fallback to DEFAULT_LOCALE when localStorage is empty', () => {
    expect(getSavedLocale()).toBe(DEFAULT_LOCALE);
  });

  it('should retrieve saved locale from localStorage if valid', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    expect(getSavedLocale()).toBe('en');
  });

  it('should fallback to DEFAULT_LOCALE if stored locale is invalid', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'xx');
    expect(getSavedLocale()).toBe(DEFAULT_LOCALE);
  });
});
