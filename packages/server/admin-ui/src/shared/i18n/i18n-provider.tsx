import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Locale } from '../../../../src/shared/messages.ts';
import { uiMessages, type UiMessageKey } from './admin-messages.ts';
import {
  browserLanguages,
  detectLocale,
  readStoredLocale,
  storeLocale,
} from './locale.ts';

/** Translates a key, replacing `{name}` placeholders from `params`. */
export type Translate = (
  key: UiMessageKey,
  params?: Readonly<Record<string, string | number>>,
) => string;

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translate;
}

const I18nContext = createContext<I18nValue | null>(null);

/**
 * Fills `{name}` placeholders. Unknown placeholders are left as they are,
 * like `translate()` in the shared catalog.
 */
export const interpolate = (
  template: string,
  params: Readonly<Record<string, string | number>> = {},
): string =>
  template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );

/**
 * Provides the current language and `t()`. The initial language comes from
 * {@link detectLocale}; `setLocale` saves the choice in `localStorage` and
 * updates `<html lang>`.
 */
export const I18nProvider = ({ children }: { children: ReactNode }) => {
  const [locale, setLocaleState] = useState<Locale>(() =>
    detectLocale(readStoredLocale(), browserLanguages()),
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    storeLocale(next);
    setLocaleState(next);
  }, []);

  const value = useMemo<I18nValue>(() => {
    const catalog = uiMessages[locale];
    return {
      locale,
      setLocale,
      t: (key, params) => interpolate(catalog[key], params),
    };
  }, [locale, setLocale]);

  return <I18nContext value={value}>{children}</I18nContext>;
};

/** Returns the current language, `setLocale`, and `t()`. */
export const useI18n = (): I18nValue => {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>');
  return value;
};
