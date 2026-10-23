import type { Locale } from '../../../src/shared/messages.ts';

/**
 * Origin of the goodnight-web documentation site.
 */
export const DOCS_BASE_URL = 'https://goodnight-web.dev';

/**
 * Returns the documentation URL for `path` (for example
 * `/docs/setup/turnstile/`) in `locale`. Japanese pages are under `/ja/`.
 */
export const docsUrl = (locale: Locale, path: `/${string}`): string =>
  `${DOCS_BASE_URL}${locale === 'ja' ? '/ja' : ''}${path}`;
