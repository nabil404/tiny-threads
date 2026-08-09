import { describe, it, expect, beforeEach } from 'vitest';
import i18n from '../index';
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY } from '../locales';

describe('i18n init', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('initializes with English as the fallback language', () => {
    expect(i18n.options.fallbackLng).toEqual(['en']);
  });

  it('resolves a real key from the common namespace', () => {
    expect(i18n.t('app.subtitle')).toBe('Merchant Administration Console');
  });

  it('starts on the default locale when nothing is saved', () => {
    expect(i18n.language).toBe(DEFAULT_LOCALE);
  });

  it('changes language via i18n.changeLanguage', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    await i18n.changeLanguage('en');
    expect(i18n.language).toBe('en');
  });
});
