import { Hono } from 'hono';
import type { HonoEnv } from '../../hono-env.ts';
import { apiError } from '../../shared/api-error.ts';
import { getAuth, isAuthConfigured } from './auth.ts';

/**
 * `/api/auth/*`: Better Auth's handler (passkey registration and sign-in,
 * session, sign-out). Answers 503 when `BETTER_AUTH_SECRET` is missing.
 */
export const authRoutes = new Hono<HonoEnv>().on(
  ['GET', 'POST'],
  '/*',
  async (c) => {
    if (!isAuthConfigured(c.env)) return apiError(c, 503, 'auth_unavailable');
    return getAuth(c.env, new URL(c.req.url).origin).handler(c.req.raw);
  },
);
