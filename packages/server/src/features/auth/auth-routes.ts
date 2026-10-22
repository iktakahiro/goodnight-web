import { Hono } from 'hono';
import type { HonoEnv } from '../../hono-env.ts';
import { apiError } from '../../shared/api-error.ts';
import { limitByIpHash } from '../../shared/ip-rate-limit.ts';
import { getAuth, isAuthConfigured } from './auth.ts';

// Better Auth endpoints that anyone can call without a session. Each sign-in
// attempt writes a challenge to D1, and Better Auth's own rate limiter is off
// because IP tracking is off, so these are limited per ip_hash here.
const PUBLIC_SIGN_IN_PATHS = new Set([
  'passkey/generate-authenticate-options',
  'passkey/verify-authentication',
]);

// The endpoint path after `/api/auth/`. Empty segments are dropped, so a
// doubled or trailing slash cannot skip the limit.
const authEndpoint = (path: string): string =>
  path
    .split('/')
    .filter((segment) => segment !== '')
    .slice(2)
    .join('/');

/**
 * `/api/auth/*`: Better Auth's handler (passkey registration and sign-in,
 * session, sign-out). Answers 503 when `BETTER_AUTH_SECRET` is missing.
 *
 * The public passkey sign-in endpoints count against `CONTACT_RATE_LIMITER`
 * with the key `auth:<ip_hash>` (429 over the limit). Without the binding or
 * `IP_HASH_SECRET` they answer 503.
 */
export const authRoutes = new Hono<HonoEnv>().on(
  ['GET', 'POST'],
  '/*',
  async (c) => {
    if (!isAuthConfigured(c.env)) return apiError(c, 503, 'auth_unavailable');
    if (PUBLIC_SIGN_IN_PATHS.has(authEndpoint(c.req.path))) {
      const limit = await limitByIpHash(c.env, c.req.raw, 'auth');
      if (limit === 'unavailable') {
        return apiError(c, 503, 'auth_unavailable');
      }
      if (limit === 'limited') return apiError(c, 429, 'rate_limited');
    }
    return getAuth(c.env, new URL(c.req.url).origin).handler(c.req.raw);
  },
);
