import type { APIRoute } from 'astro';
import { siteConfig } from '../../site.config';

export const GET: APIRoute = () =>
  new Response(
    `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${new URL('/sitemap.xml', siteConfig.url).href}\n`,
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
