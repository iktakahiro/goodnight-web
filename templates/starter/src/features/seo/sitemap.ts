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
  pages: string[];
  posts: SitemapPost[];
}

/** Maps a localized Astro route file to its URL path, excluding dynamic routes. */
export function routeFilePath(file: string): string | undefined {
  const prefix = '/src/pages/[...lang]/';
  if (!file.startsWith(prefix) || !file.endsWith('.astro')) return undefined;
  const route = file.slice(prefix.length, -'.astro'.length);
  if (route.includes('[') || route.includes(']')) return undefined;
  const parts = route.split('/');
  if (parts.at(-1) === 'index') parts.pop();
  return parts.length ? `/${parts.join('/')}/` : '/';
}

/** Maps published post route entries to sitemap entries. */
export function sitemapPosts(
  collection: 'blog' | 'news',
  entries: readonly {
    props: {
      slug: string;
      locale: Locale;
      locales: Locale[];
      post: { data: { date: Date; updated?: Date } };
    };
  }[],
): SitemapPost[] {
  return entries.map(({ props }) => ({
    path: `/${collection}/${props.slug}/`,
    locale: props.locale,
    locales: props.locales,
    lastmod: props.post.data.updated ?? props.post.data.date,
  }));
}

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
  const { url, locales, localeTags, localizePath, pages, posts } = options;
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
