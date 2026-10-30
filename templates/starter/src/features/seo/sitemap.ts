import type { Locale } from '../../../site.config';

/** A published post and the languages in which its slug exists. */
export interface SitemapPost {
  path: string;
  locale: Locale;
  locales: Locale[];
  lastmod?: Date;
}

/** Settings and published content needed to render a sitemap. */
export interface SitemapOptions {
  url: string;
  locales: readonly Locale[];
  localeTags: Record<Locale, string>;
  localizePath: (locale: Locale, path: string) => string;
  posts: SitemapPost[];
}

const pages = [
  '/',
  '/about/',
  '/services/',
  '/blog/',
  '/news/',
  '/contact/',
  '/privacy/',
];

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/** Renders the indexable pages and their available language versions as XML. */
export function renderSitemap(options: SitemapOptions): string {
  const { url, locales, localeTags, localizePath, posts } = options;
  const entries = [
    ...pages.flatMap((path) =>
      locales.map((locale) => ({ path, locale, locales, lastmod: undefined })),
    ),
    ...posts,
  ];
  const absolute = (locale: Locale, path: string) =>
    new URL(localizePath(locale, path), url).href;
  const items = entries.map((entry) => {
    const links = entry.locales
      .map(
        (locale) =>
          `    <xhtml:link rel="alternate" hreflang="${escapeXml(localeTags[locale])}" href="${escapeXml(absolute(locale, entry.path))}" />`,
      )
      .join('\n');
    const lastmod = entry.lastmod
      ? `\n    <lastmod>${escapeXml(entry.lastmod.toISOString())}</lastmod>`
      : '';
    return `  <url>\n    <loc>${escapeXml(absolute(entry.locale, entry.path))}</loc>\n${links}${lastmod}\n  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${items.join('\n')}\n</urlset>\n`;
}
