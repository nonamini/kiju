/**
 * Custom Locales Override Storage and Loader.
 * Allows users to export standard i18n dictionaries, edit them, and import custom overrides
 * stored in localStorage.
 * Follows Rule 1: strictly English code, comments, identifiers.
 * Follows Rule 2: strict TypeScript, zero any.
 */

import i18n from 'i18next';
import { getSafeStorage } from './matchHistoryStorage';
import jaBase from '../locales/ja.json';
import enBase from '../locales/en.json';

export const CUSTOM_LOCALES_STORAGE_KEY_PREFIX = 'joseki_tree_custom_locale_';

export type SupportedLanguage = 'ja' | 'en';

/**
 * Loads custom locale override JSON for the given language from storage.
 */
export function loadCustomLocaleOverride(lang: SupportedLanguage): Record<string, unknown> | null {
  try {
    const raw = getSafeStorage().getItem(`${CUSTOM_LOCALES_STORAGE_KEY_PREFIX}${lang}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch (err) {
    console.warn(`[customLocales] Failed to parse custom locale for ${lang}:`, err);
  }
  return null;
}

/**
 * Saves custom locale override JSON for the given language into storage and applies to i18n instance.
 */
export function saveCustomLocaleOverride(
  lang: SupportedLanguage,
  overrideData: Record<string, unknown>
): void {
  try {
    getSafeStorage().setItem(
      `${CUSTOM_LOCALES_STORAGE_KEY_PREFIX}${lang}`,
      JSON.stringify(overrideData, null, 2)
    );
    // Deep merge into active i18n bundle (deep: true, overwrite: true)
    i18n.addResourceBundle(lang, 'translation', overrideData, true, true);
  } catch (err) {
    console.error(`[customLocales] Failed to save custom locale for ${lang}:`, err);
  }
}

/**
 * Clears custom locale override for the given language and restores bundled standard defaults.
 */
export function clearCustomLocaleOverride(lang: SupportedLanguage): void {
  try {
    getSafeStorage().removeItem(`${CUSTOM_LOCALES_STORAGE_KEY_PREFIX}${lang}`);
    const standardResource = lang === 'ja' ? jaBase : enBase;
    // Overwrite back with the clean bundled base resources
    i18n.addResourceBundle(lang, 'translation', standardResource, true, true);
  } catch (err) {
    console.warn(`[customLocales] Failed to clear custom locale for ${lang}:`, err);
  }
}

/**
 * Applies any persisted custom locale overrides to the i18n instance at app initialization.
 */
export function applyPersistedCustomLocales(): void {
  const languages: SupportedLanguage[] = ['ja', 'en'];
  for (const lang of languages) {
    const override = loadCustomLocaleOverride(lang);
    if (override && Object.keys(override).length > 0) {
      i18n.addResourceBundle(lang, 'translation', override, true, true);
    }
  }
}

/**
 * Exports current effective or bundled dictionary as formatted JSON string for download.
 */
export function exportStandardLocaleJson(lang: SupportedLanguage): string {
  const base = lang === 'ja' ? jaBase : enBase;
  const custom = loadCustomLocaleOverride(lang);
  // If user already has customizations, merge custom onto base for export
  const merged = custom ? deepMergeObjects(base as Record<string, unknown>, custom) : base;
  return JSON.stringify(merged, null, 2);
}

/** Helper deep merge for JSON objects */
function deepMergeObjects(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const output: Record<string, unknown> = { ...target };
  for (const key of Object.keys(source)) {
    const sVal = source[key];
    const tVal = target[key];
    if (
      sVal &&
      typeof sVal === 'object' &&
      !Array.isArray(sVal) &&
      tVal &&
      typeof tVal === 'object' &&
      !Array.isArray(tVal)
    ) {
      output[key] = deepMergeObjects(
        tVal as Record<string, unknown>,
        sVal as Record<string, unknown>
      );
    } else {
      output[key] = sVal;
    }
  }
  return output;
}
