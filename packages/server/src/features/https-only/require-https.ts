import { createMiddleware } from 'hono/factory';
import type { HonoEnv } from '../../hono-env.ts';
import { apiError } from '../../shared/api-error.ts';
import { isAdminArea, requestArea } from '../../shared/request-path.ts';

// Plain HTTP is accepted only on the local development hosts.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Requires HTTPS for the admin UI, the admin API, setup, and Better Auth
 * (see {@link isAdminArea}). Over plain HTTP the setup token, session
 * cookies, and passkey ceremonies would cross the network in clear text, and
 * Better Auth would set cookies without `Secure`.
 *
 * - `GET` and `HEAD` over HTTP are redirected to the same URL on HTTPS
 *   (308).
 * - Any other method over HTTP gets 403 `https_required`. It is not
 *   redirected, because the body was already sent in clear text.
 * - `localhost`, `127.0.0.1`, and `[::1]` are exempt, for `wrangler dev`.
 *
 * The contact API and the site are not affected; turn on "Always Use HTTPS"
 * for the zone to cover them.
 */
export const requireHttps = createMiddleware<HonoEnv>(async (c, next) => {
  const url = new URL(c.req.url);
  if (
    url.protocol === 'https:' ||
    LOCAL_HOSTS.has(url.hostname) ||
    !isAdminArea(requestArea(c.req.url, c.req.path))
  ) {
    await next();
    return;
  }
  if (c.req.method === 'GET' || c.req.method === 'HEAD') {
    url.protocol = 'https:';
    url.port = '';
    return c.redirect(url.toString(), 308);
  }
  return apiError(c, 403, 'https_required');
});
