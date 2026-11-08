import { escapeXml } from './xml';

/** A post as the feed needs it. */
export interface FeedPost {
  /** The post's slug inside its collection and language. */
  slug: string;
  data: {
    title: string;
    description: string;
    /** Publication date. */
    date: Date;
    /** Date of the last important change. */
    updated?: Date;
    tags?: readonly string[];
    draft?: boolean;
  };
}

/** Settings and posts needed to render one RSS feed. */
export interface FeedOptions {
  /** The public URL of the site, such as `https://example.com`. */
  siteUrl: string;
  /** Channel title. */
  title: string;
  /** Channel description. */
  description: string;
  /** BCP 47 language tag of the posts, such as `ja-JP`. */
  language: string;
  /** Path of the feed itself, such as `/en/blog/rss.xml`. */
  feedPath: string;
  /** Path of the page the feed belongs to, such as `/en/blog/`. */
  pagePath: string;
  /** Path of a post's page, from its slug. */
  postPath: (slug: string) => string;
  /** Posts of one collection and language, in any order. Drafts are skipped. */
  posts: readonly FeedPost[];
}

/**
 * Renders an RSS 2.0 feed of the published posts, newest first.
 *
 * Draft posts are left out, links are absolute URLs built from `siteUrl`, and
 * dates are in RFC 822 form (`Thu, 01 Oct 2026 00:00:00 GMT`). The channel's
 * `lastBuildDate` is the latest change among the posts, not the build time,
 * so building the same content twice gives the same file.
 */
export function renderRss(options: FeedOptions): string {
  const { siteUrl, title, description, language, posts } = options;
  const absolute = (path: string) => new URL(path, siteUrl).href;
  const published = posts
    .filter((post) => !post.data.draft)
    .toSorted((a, b) => b.data.date.getTime() - a.data.date.getTime());
  const items = published.map((post) => {
    const link = escapeXml(absolute(options.postPath(post.slug)));
    const categories = (post.data.tags ?? [])
      .map((tag) => `      <category>${escapeXml(tag)}</category>\n`)
      .join('');
    return (
      `    <item>\n` +
      `      <title>${escapeXml(post.data.title)}</title>\n` +
      `      <link>${link}</link>\n` +
      `      <guid isPermaLink="true">${link}</guid>\n` +
      `      <pubDate>${post.data.date.toUTCString()}</pubDate>\n` +
      `      <description>${escapeXml(post.data.description)}</description>\n` +
      categories +
      `    </item>`
    );
  });
  const latest = published.reduce<Date | undefined>((newest, post) => {
    const changed = post.data.updated ?? post.data.date;
    const date = changed > post.data.date ? changed : post.data.date;
    return !newest || date > newest ? date : newest;
  }, undefined);
  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">`,
    `  <channel>`,
    `    <title>${escapeXml(title)}</title>`,
    `    <link>${escapeXml(absolute(options.pagePath))}</link>`,
    `    <description>${escapeXml(description)}</description>`,
    `    <language>${escapeXml(language)}</language>`,
    `    <atom:link href="${escapeXml(absolute(options.feedPath))}" rel="self" type="application/rss+xml" />`,
    ...(latest
      ? [`    <lastBuildDate>${latest.toUTCString()}</lastBuildDate>`]
      : []),
    ...items,
    `  </channel>`,
    `</rss>`,
  ];
  return `${lines.join('\n')}\n`;
}
