import type { APIRoute } from 'astro';
import { postFeedResponse } from '../../../features/posts/post-feed';
import { localeFromParam, localeStaticPaths } from '../../../i18n/locales';

export const getStaticPaths = localeStaticPaths;

export const GET: APIRoute = ({ params }) =>
  postFeedResponse(localeFromParam(params.lang), 'blog');
