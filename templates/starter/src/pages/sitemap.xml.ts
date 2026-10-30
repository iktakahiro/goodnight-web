import type { APIRoute } from 'astro';
import { siteConfig } from '../../site.config';
import { postStaticPaths, type PostCollection } from '../features/posts/posts';
import {
  renderSitemap,
  routeFilePath,
  sitemapPosts,
} from '../features/seo/sitemap';
import { localeParam, localeTags, localizePath } from '../i18n/locales';

export const GET: APIRoute = async () => {
  const collections: PostCollection[] = ['blog', 'news'];
  const posts = (
    await Promise.all(
      collections.map(async (collection) => {
        const paths = await postStaticPaths(collection, localeParam);
        return sitemapPosts(collection, paths);
      }),
    )
  ).flat();
  return new Response(
    renderSitemap({
      url: siteConfig.url,
      locales: siteConfig.locales,
      localeTags,
      localizePath,
      pages: Object.keys(import.meta.glob('/src/pages/[[]...lang]/**/*.astro'))
        .map(routeFilePath)
        .filter((path): path is string => path !== undefined),
      posts,
    }),
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
};
