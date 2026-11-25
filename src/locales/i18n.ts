import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import jaTranslation from './ja.json';
import enTranslation from './en.json';
import { loadAppSettings } from '../utils/appSettingsStorage';
import { applyPersistedCustomLocales } from '../utils/customLocalesStorage';

export const resources = {
  ja: {
    translation: jaTranslation,
  },
  en: {
    translation: enTranslation,
  },
} as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: loadAppSettings().language,
  fallbackLng: 'ja',
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false, // Ensure synchronous rendering without uncaught Suspense reloads
  },
});

// Apply user's custom locale overrides immediately after initialization
applyPersistedCustomLocales();

export default i18n;
