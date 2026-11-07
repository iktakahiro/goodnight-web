import { describe, expect, test } from 'bun:test';
import { renderRss, type FeedOptions, type FeedPost } from './feed';
import { escapeXml } from './xml';

function post(
  slug: string,
  date: string,
  data: Partial<FeedPost['data']> = {},
) {
  return {
    slug,
    data: {
      title: `Title ${slug}`,
      description: `About ${slug}`,
      date: new Date(date),
      ...data,
    },
  } satisfies FeedPost;
}

const options: FeedOptions = {
  siteUrl: 'https://example.com',
  title: 'Blog | Yunagi Works',
  description: 'Notes from the workshop',
  language: 'en-US',
  feedPath: '/en/blog/rss.xml',
  pagePath: '/en/blog/',
  postPath: (slug) => `/en/blog/${slug}/`,
  posts: [],
};

describe('renderRss', () => {
  test('lists posts newest first', () => {
    const xml = renderRss({
      ...options,
      posts: [
        post('old', '2026-01-05'),
        post('new', '2026-10-01'),
        post('mid', '2026-05-20'),
      ],
    });
    const links = [...xml.matchAll(/<item>[\s\S]*?<link>(.*?)<\/link>/g)].map(
      (match) => match[1],
    );
    expect(links).toEqual([
      'https://example.com/en/blog/new/',
      'https://example.com/en/blog/mid/',
      'https://example.com/en/blog/old/',
    ]);
  });

  test('leaves out drafts', () => {
    const xml = renderRss({
      ...options,
      posts: [
        post('public', '2026-10-01'),
        post('secret', '2026-10-02', { draft: true }),
      ],
    });
    expect(xml).toContain('/en/blog/public/');
    expect(xml).not.toContain('secret');
    expect(xml.match(/<item>/g)).toHaveLength(1);
  });

  test('uses absolute URLs for the channel, the feed itself, and posts', () => {
    const xml = renderRss({ ...options, posts: [post('a', '2026-10-01')] });
    expect(xml).toContain('<link>https://example.com/en/blog/</link>');
    expect(xml).toContain(
      '<atom:link href="https://example.com/en/blog/rss.xml" rel="self" type="application/rss+xml" />',
    );
    expect(xml).toContain('<link>https://example.com/en/blog/a/</link>');
    expect(xml).toContain(
      '<guid isPermaLink="true">https://example.com/en/blog/a/</guid>',
    );
    expect(xml).toContain('<language>en-US</language>');
  });

  test('writes RFC 822 dates', () => {
    const xml = renderRss({
      ...options,
      posts: [
        post('a', '2026-10-01', { updated: new Date('2026-10-15') }),
        post('b', '2026-03-02'),
      ],
    });
    expect(xml).toContain('<pubDate>Thu, 01 Oct 2026 00:00:00 GMT</pubDate>');
    expect(xml).toContain('<pubDate>Mon, 02 Mar 2026 00:00:00 GMT</pubDate>');
    // The latest change, not the build time.
    expect(xml).toContain(
      '<lastBuildDate>Thu, 15 Oct 2026 00:00:00 GMT</lastBuildDate>',
    );
  });

  test('escapes text and attributes', () => {
    const xml = renderRss({
      ...options,
      title: `Tom & "Jerry" <b>`,
      feedPath: '/feed.xml?a=1&b=2',
      posts: [
        post('x', '2026-10-01', {
          title: `5 < 6 & 7 > 3`,
          description: `It's "quoted" </description>`,
          tags: ['a&b'],
        }),
      ],
    });
    expect(xml).toContain(
      '<title>Tom &amp; &quot;Jerry&quot; &lt;b&gt;</title>',
    );
    expect(xml).toContain('<title>5 &lt; 6 &amp; 7 &gt; 3</title>');
    expect(xml).toContain(
      '<description>It&apos;s &quot;quoted&quot; &lt;/description&gt;</description>',
    );
    expect(xml).toContain('<category>a&amp;b</category>');
    expect(xml).toContain('href="https://example.com/feed.xml?a=1&amp;b=2"');
  });

  test('renders an empty channel without lastBuildDate', () => {
    const xml = renderRss(options);
    expect(xml).not.toContain('<item>');
    expect(xml).not.toContain('lastBuildDate');
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml.endsWith('</rss>\n')).toBe(true);
  });
});

describe('escapeXml', () => {
  test('drops characters XML 1.0 cannot hold but keeps valid text', () => {
    expect(escapeXml('a\u0000b\u000Bc￾d\uD800e')).toBe('abcde');
    expect(escapeXml('改行\n\tと絵文字😀')).toBe('改行\n\tと絵文字😀');
  });
});
