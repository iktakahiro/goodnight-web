import { describe, expect, test } from 'bun:test';
import {
  renderSitemap,
  routeFilePath,
  sitemapPosts,
  type SitemapOptions,
} from './sitemap';

const options: SitemapOptions = {
  url: 'https://example.com',
  locales: ['ja', 'en'],
  localeTags: { ja: 'ja-JP', en: 'en-US' },
  localizePath: (locale, path) => (locale === 'ja' ? path : `/en${path}`),
  pages: ['/', '/about/'],
  posts: [],
};

describe('renderSitemap', () => {
  test('lists fixed pages and only available post translations', () => {
    const xml = renderSitemap({
      ...options,
      posts: [
        {
          path: '/blog/solo/',
          locale: 'ja',
          locales: ['ja'],
          lastmod: new Date('2026-10-01'),
        },
      ],
    });
    expect(xml.match(/<url>/g)).toHaveLength(5);
    expect(xml).toContain('<loc>https://example.com/en/about/</loc>');
    const post = xml
      .split('<url>')
      .find((entry) => entry.includes('/blog/solo/'));
    expect(post).toContain('hreflang="ja-JP"');
    expect(post).not.toContain('hreflang="en-US"');
    expect(post).toContain('<lastmod>2026-10-01T00:00:00.000Z</lastmod>');
    expect(xml).not.toContain('/admin');
    expect(xml).not.toContain('/api/');
  });

  test('escapes XML text and attributes', () => {
    const xml = renderSitemap({
      ...options,
      localeTags: { ja: `ja&"'< >`, en: 'en-US' },
      localizePath: () => '/?a=1&b=2',
    });
    expect(xml).toContain('hreflang="ja&amp;&quot;&apos;&lt; &gt;"');
    expect(xml).toContain('https://example.com/?a=1&amp;b=2');
  });
});

describe('routeFilePath', () => {
  test('maps static pages and skips dynamic routes', () => {
    expect(routeFilePath('/src/pages/[...lang]/index.astro')).toBe('/');
    expect(routeFilePath('/src/pages/[...lang]/about.astro')).toBe('/about/');
    expect(routeFilePath('/src/pages/[...lang]/blog/index.astro')).toBe(
      '/blog/',
    );
    expect(
      routeFilePath('/src/pages/[...lang]/blog/[slug].astro'),
    ).toBeUndefined();
    expect(
      routeFilePath('/src/pages/[...lang]/[section]/index.astro'),
    ).toBeUndefined();
    expect(routeFilePath('/src/pages/404.astro')).toBeUndefined();
  });
});

describe('sitemapPosts', () => {
  test('maps post routes, available languages, and the latest date', () => {
    const date = new Date('2026-10-01');
    const updated = new Date('2026-10-10');
    expect(
      sitemapPosts('news', [
        {
          props: {
            slug: 'solo',
            locale: 'en',
            locales: ['en'],
            post: { data: { date, updated } },
          },
        },
        {
          props: {
            slug: 'other',
            locale: 'ja',
            locales: ['ja', 'en'],
            post: { data: { date } },
          },
        },
      ]),
    ).toEqual([
      { path: '/news/solo/', locale: 'en', locales: ['en'], lastmod: updated },
      {
        path: '/news/other/',
        locale: 'ja',
        locales: ['ja', 'en'],
        lastmod: date,
      },
    ]);
  });
});
