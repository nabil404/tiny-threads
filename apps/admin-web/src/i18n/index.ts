import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en/common.json';
import es from './locales/es/common.json';
import fr from './locales/fr/common.json';
import ar from './locales/ar/common.json';
import { getSavedLocale } from './locales';

void i18n.use(initReactI18next).init({
  resources: {
    en: { common: en },
    es: { common: es },
    fr: { common: fr },
    ar: { common: ar },
  },
  lng: getSavedLocale(),
  fallbackLng: 'en',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
});

export default i18n;

