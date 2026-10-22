import { and, asc, eq, isNotNull } from 'drizzle-orm';
import { createMiddleware } from 'hono/factory';
import { getDatabase } from '../../db/database.ts';
import { passkey } from '../../db/schema.ts';
import type { HonoEnv } from '../../hono-env.ts';
import { apiError } from '../../shared/api-error.ts';
import { isAllowedOrigin } from '../../shared/request.ts';
import { isAdminEmail } from './admin-emails.ts';
import { getAuth, isAuthConfigured } from './auth.ts';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Middleware for every admin API route. There is no bypass:
 *
 * - 503 when `BETTER_AUTH_SECRET` is missing;
 * - 403 for a state-changing request whose `Origin` is not this site (CSRF);
 * - 401 without a valid Better Auth session;
 * - 403 when the user's email is not in `ADMIN_EMAILS`. The list is read
 *   from `env` on every request, so removing an address locks its sessions
 *   out at once;
 * - 403 when the user has no passkey yet (the session from setup only
 *   allows registering one);
 * - 401 when the session was created before the user's first passkey. Only
 *   sessions from a passkey sign-in, or from the registration of the first
 *   passkey, are admin sessions; a session from setup never becomes one.
 *
 * On success it sets `c.var.admin`.
 */
export const requireAdmin = createMiddleware<HonoEnv>(async (c, next) => {
  if (!isAuthConfigured(c.env)) return apiError(c, 503, 'auth_unavailable');
  if (!SAFE_METHODS.has(c.req.method) && !isAllowedOrigin(c.req.raw)) {
    return apiError(c, 403, 'forbidden_origin');
  }
  const auth = getAuth(c.env, new URL(c.req.url).origin);
  const result = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!result) return apiError(c, 401, 'unauthorized');
  const { user, session } = result;
  if (!isAdminEmail(c.env.ADMIN_EMAILS, user.email)) {
    return apiError(c, 403, 'forbidden');
  }
  const first = await getDatabase(c.env.DB)
    .select({ createdAt: passkey.createdAt })
    .from(passkey)
    .where(and(eq(passkey.userId, user.id), isNotNull(passkey.createdAt)))
    .orderBy(asc(passkey.createdAt))
    .get();
  if (!first?.createdAt) return apiError(c, 403, 'passkey_required');
  if (session.createdAt.getTime() < first.createdAt.getTime()) {
    return apiError(c, 401, 'unauthorized');
  }
  c.set('admin', { userId: user.id, email: user.email, name: user.name });
  await next();
});
