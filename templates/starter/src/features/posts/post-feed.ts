import { siteConfig, type Locale } from '../../../site.config';
import { localeTags, localizePath } from '../../i18n/locales';
import { ui } from '../../i18n/ui';
import { renderRss } from '../seo/feed';
import { getPosts, parsePostId, type PostCollection } from './posts';

/**
 * The path of a collection's feed in a language, such as `/blog/rss.xml` or
 * `/en/news/rss.xml`. It sits next to the collection's list page.
 */
export function postFeedPath(
  locale: Locale,
  collection: PostCollection,
): string {
  return `${localizePath(locale, `/${collection}/`)}rss.xml`;
}

/** The title of a collection's feed in a language, for the feed and its links. */
export function postFeedTitle(
  locale: Locale,
  collection: PostCollection,
): string {
  return `${ui[collection][locale]} | ${siteConfig.company.name[locale]}`;
}

/** Builds the RSS response for one collection in one language. */
export async function postFeedResponse(
  locale: Locale,
  collection: PostCollection,
): Promise<Response> {
  const posts = await getPosts(collection, locale);
  const xml = renderRss({
    siteUrl: siteConfig.url,
    title: postFeedTitle(locale, collection),
    description: siteConfig.company.description[locale],
    language: localeTags[locale],
    feedPath: postFeedPath(locale, collection),
    pagePath: localizePath(locale, `/${collection}/`),
    postPath: (slug) => localizePath(locale, `/${collection}/${slug}/`),
    posts: posts.map((post) => ({
      slug: parsePostId(post.id).slug,
      data: post.data,
    })),
  });
  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
}
