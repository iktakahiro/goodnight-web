import { getCollection, type CollectionEntry } from 'astro:content';
import { siteConfig, type Locale } from '../../../site.config';
import { postNeighbors } from './post-neighbors';

/** A collection that holds dated posts. */
export type PostCollection = 'news' | 'blog';

/** A news or blog entry. */
export type Post = CollectionEntry<PostCollection>;

/**
 * Splits an entry id such as `ja/opening-the-new-workshop` into its locale and
 * slug.
 *
 * @throws Error when the file is not inside a configured locale folder.
 */
export function parsePostId(id: string): { locale: Locale; slug: string } {
  const [folder, ...rest] = id.split('/');
  const locale = siteConfig.locales.find((l) => l === folder);
  if (!locale || rest.length === 0) {
    throw new Error(
      `Post "${id}" must be in a language folder: ${siteConfig.locales.map((l) => `${l}/`).join(', ')}`,
    );
  }
  return { locale, slug: rest.join('/') };
}

/** Published posts of a collection in one language, newest first. */
export async function getPosts(
  collection: PostCollection,
  locale: Locale,
): Promise<Post[]> {
  const entries = await getCollection(
    collection,
    (entry) => !entry.data.draft && parsePostId(entry.id).locale === locale,
  );
  return entries.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

/**
 * Static paths for a post detail page: one path per published post in every
 * language, with the post and the languages that have the same slug.
 */
export async function postStaticPaths(
  collection: PostCollection,
  localeParam: (locale: Locale) => string | undefined,
) {
  const entries = await getCollection(collection, (entry) => !entry.data.draft);
  const parsed = entries.map((entry) => ({ entry, ...parsePostId(entry.id) }));
  const postsByLocale = await Promise.all(
    siteConfig.locales.map(
      async (locale) => [locale, await getPosts(collection, locale)] as const,
    ),
  );
  return parsed.map(({ entry, locale, slug }) => ({
    params: { lang: localeParam(locale), slug },
    props: {
      post: entry,
      neighbors: postNeighbors(
        postsByLocale.find(([l]) => l === locale)?.[1] ?? [],
        entry.id,
      ),
      locale,
      slug,
      locales: parsed.filter((p) => p.slug === slug).map((p) => p.locale),
    },
  }));
}
