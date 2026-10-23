import type { D1Database } from '@cloudflare/workers-types';
import { eq } from 'drizzle-orm';
import { createMiddleware } from 'hono/factory';
import { getDatabase } from '../../db/database.ts';
import { session as sessionTable } from '../../db/schema.ts';
import type { HonoEnv } from '../../hono-env.ts';
import { apiError } from '../../shared/api-error.ts';
import { safeErrorMessage } from '../../shared/log-error.ts';
import { isAllowedOrigin } from '../../shared/request.ts';
import { isAdminEmail } from './admin-emails.ts';
import { getAuth, isAuthConfigured } from './auth.ts';
import { checkPasskeySession } from './passkey-session.ts';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const deleteSessionsOf = async (db: D1Database, userId: string) => {
  await getDatabase(db)
    .delete(sessionTable)
    .where(eq(sessionTable.userId, userId));
};

/**
 * Middleware for every admin API route. There is no bypass:
 *
 * - 503 when `BETTER_AUTH_SECRET` is missing;
 * - 403 for a state-changing request whose `Origin` is not this site (CSRF);
 * - 401 without a valid Better Auth session;
 * - 403 when the user's email is not in `ADMIN_EMAILS`. The list is read
 *   from `env` on every request, so removing an address locks its sessions
 *   out at once. Every session of that user is then deleted in
 *   `ctx.waitUntil` (best effort; the response stays 403), so adding the
 *   address back later does not bring an old session back;
 * - 403 when the user has no passkey yet (the session from setup only
 *   allows registering one);
 * - 401 when the session was created before the user's first passkey. Only
 *   sessions from a passkey sign-in, or from the registration of the first
 *   passkey, are admin sessions; a session from setup never becomes one.
 *
 * The session is read with `disableRefresh`, so admin API calls never extend
 * a session's expiry; only Better Auth's own endpoints do.
 *
 * On success it sets `c.var.admin`.
 */
export const requireAdmin = createMiddleware<HonoEnv>(async (c, next) => {
  if (!isAuthConfigured(c.env)) return apiError(c, 503, 'auth_unavailable');
  if (!SAFE_METHODS.has(c.req.method) && !isAllowedOrigin(c.req.raw)) {
    return apiError(c, 403, 'forbidden_origin');
  }
  const auth = getAuth(c.env, new URL(c.req.url).origin);
  const result = await auth.api.getSession({
    headers: c.req.raw.headers,
    query: { disableRefresh: true },
  });
  if (!result) return apiError(c, 401, 'unauthorized');
  const { user, session } = result;
  if (!isAdminEmail(c.env.ADMIN_EMAILS, user.email)) {
    c.executionCtx.waitUntil(
      deleteSessionsOf(c.env.DB, user.id).catch((error: unknown) => {
        console.error('session cleanup failed:', safeErrorMessage(error));
      }),
    );
    return apiError(c, 403, 'forbidden');
  }
  const state = await checkPasskeySession(c.env.DB, user.id, session.createdAt);
  if (state === 'no_passkey') return apiError(c, 403, 'passkey_required');
  if (state === 'too_old') return apiError(c, 401, 'unauthorized');
  c.set('admin', { userId: user.id, email: user.email, name: user.name });
  await next();
});
