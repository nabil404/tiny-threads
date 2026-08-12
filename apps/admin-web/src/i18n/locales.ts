export type LocaleId = 'en' | 'es' | 'fr' | 'ar';

export interface LocaleConfig {
  id: LocaleId;
  nativeName: string;
  englishName: string;
}

export const LOCALES: LocaleConfig[] = [
  { id: 'en', nativeName: 'English', englishName: 'English' },
  { id: 'es', nativeName: 'Español', englishName: 'Spanish' },
  { id: 'fr', nativeName: 'Français', englishName: 'French' },
  { id: 'ar', nativeName: 'العربية', englishName: 'Arabic' },
];

export const DEFAULT_LOCALE: LocaleId = 'en';
export const LOCALE_STORAGE_KEY = 'tiny_threads_admin_locale';

export function getSavedLocale(): LocaleId {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
  if (saved && LOCALES.some((l) => l.id === saved)) {
    return saved as LocaleId;
  }
  return DEFAULT_LOCALE;
}
