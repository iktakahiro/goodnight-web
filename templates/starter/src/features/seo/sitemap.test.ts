import { describe, expect, test } from 'bun:test';
import { renderSitemap, type SitemapOptions } from './sitemap';

const options: SitemapOptions = {
  url: 'https://example.com',
  locales: ['ja', 'en'],
  localeTags: { ja: 'ja-JP', en: 'en-US' },
  localizePath: (locale, path) => (locale === 'ja' ? path : `/en${path}`),
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
    expect(xml.match(/<url>/g)).toHaveLength(15);
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
