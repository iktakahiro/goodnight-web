import type { Locale } from '../../../src/shared/messages.ts';

/**
 * Origin of the goodnight-web documentation site.
 *
 * TODO: replace with the real domain once the documentation site has one.
 * `.invalid` never resolves, so a wrong link is obvious.
 */
export const DOCS_BASE_URL = 'https://goodnight-web.invalid';

/**
 * Returns the documentation URL for `path` (for example
 * `/docs/setup/turnstile/`) in `locale`. Japanese pages are under `/ja/`.
 */
export const docsUrl = (locale: Locale, path: `/${string}`): string =>
  `${DOCS_BASE_URL}${locale === 'ja' ? '/ja' : ''}${path}`;
