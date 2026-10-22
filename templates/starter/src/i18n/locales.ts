import { getRelativeLocaleUrl } from 'astro:i18n';
import { siteConfig, type Locale } from '../../site.config';

/** The name of each language, written in that language. */
export const localeNames: Record<Locale, string> = {
  ja: '日本語',
  en: 'English',
};

/** The BCP 47 tag used for `lang` attributes and date formatting. */
export const localeTags: Record<Locale, string> = {
  ja: 'ja-JP',
  en: 'en-US',
};

/**
 * The value of the `[...lang]` route parameter for a locale: `undefined` for
 * the default locale (served at the root) and the locale code otherwise.
 */
export function localeParam(locale: Locale): string | undefined {
  return locale === siteConfig.defaultLocale ? undefined : locale;
}

/**
 * Resolves the `[...lang]` route parameter to a locale.
 *
 * @throws Error when the parameter is not a configured locale. Pages only
 * receive parameters from {@link localeStaticPaths}, so this means a bug.
 */
export function localeFromParam(lang: string | undefined): Locale {
  if (lang === undefined) return siteConfig.defaultLocale;
  const locale = siteConfig.locales.find((l) => l === lang);
  if (!locale) throw new Error(`Unknown locale in the URL: ${lang}`);
  return locale;
}

/**
 * Static paths for a page under `src/pages/[...lang]/`: one path per
 * configured locale. Use it as `export const getStaticPaths = localeStaticPaths;`.
 */
export function localeStaticPaths(): {
  params: { lang: string | undefined };
}[] {
  return siteConfig.locales.map((locale) => ({
    params: { lang: localeParam(locale) },
  }));
}

/**
 * Builds the URL of a page in a locale.
 *
 * @param path - Path without the language prefix, such as `/about/` or `/`.
 */
export function localizePath(locale: Locale, path: string): string {
  return getRelativeLocaleUrl(locale, path.replace(/^\/+/, ''));
}

/** Formats a date for a locale, for example `2026年10月1日` or `October 1, 2026`. */
export function formatDate(locale: Locale, date: Date): string {
  // Frontmatter dates are parsed as UTC midnight; format them in UTC so the
  // day does not shift in other time zones.
  return new Intl.DateTimeFormat(localeTags[locale], {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(date);
}
