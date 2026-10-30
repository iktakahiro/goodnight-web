import type { APIRoute } from 'astro';
import { siteConfig } from '../../site.config';
import { postStaticPaths, type PostCollection } from '../features/posts/posts';
import { renderSitemap } from '../features/seo/sitemap';
import { localeParam, localeTags, localizePath } from '../i18n/locales';

export const GET: APIRoute = async () => {
  const collections: PostCollection[] = ['blog', 'news'];
  const posts = (
    await Promise.all(
      collections.map(async (collection) => {
        const paths = await postStaticPaths(collection, localeParam);
        return paths.map(({ props }) => ({
          path: `/${collection}/${props.slug}/`,
          locale: props.locale,
          locales: props.locales,
          lastmod: props.post.data.updated ?? props.post.data.date,
        }));
      }),
    )
  ).flat();
  return new Response(
    renderSitemap({
      url: siteConfig.url,
      locales: siteConfig.locales,
      localeTags,
      localizePath,
      posts,
    }),
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
};
