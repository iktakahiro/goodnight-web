import {
  LOCALES,
  pickLocale,
  type Locale,
} from '../../../../src/shared/messages.ts';

/** `localStorage` key that keeps the language chosen in the header. */
export const LOCALE_STORAGE_KEY = 'goodnight-web.admin.locale';

/** Narrows a stored or user-supplied value to a supported locale. */
export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (LOCALES as readonly string[]).includes(value);

/**
 * Picks the admin UI language.
 *
 * A language saved with the header switch wins. Otherwise the first of the
 * browser's preferred languages (`navigator.languages`) that is Japanese or
 * English, in order. Falls back to English.
 */
export const detectLocale = (
  stored: string | null | undefined,
  languages: readonly string[],
): Locale => {
  if (isLocale(stored)) return stored;
  return pickLocale(languages.join(','), 'en');
};

/** Reads the saved language. Returns `null` when storage is unavailable. */
export const readStoredLocale = (): string | null => {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
};

/** Saves the language. Ignores storage errors (private mode, quota). */
export const storeLocale = (locale: Locale): void => {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // The choice still applies until the page is reloaded.
  }
};

/** The browser's preferred languages, most preferred first. */
export const browserLanguages = (): readonly string[] =>
  navigator.languages.length > 0 ? navigator.languages : [navigator.language];
