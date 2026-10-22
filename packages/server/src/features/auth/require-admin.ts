import { eq } from 'drizzle-orm';
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
 * - 403 when the user's email is no longer in `ADMIN_EMAILS`, or the user has
 *   no passkey yet (the session from setup only allows registering one).
 *
 * On success it sets `c.var.admin`.
 */
export const requireAdmin = createMiddleware<HonoEnv>(async (c, next) => {
  if (!isAuthConfigured(c.env)) return apiError(c, 503, 'auth_unavailable');
  if (!SAFE_METHODS.has(c.req.method) && !isAllowedOrigin(c.req.raw)) {
    return apiError(c, 403, 'forbidden_origin');
  }
  const auth = getAuth(c.env, new URL(c.req.url).origin);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return apiError(c, 401, 'unauthorized');
  const { user } = session;
  if (!isAdminEmail(c.env.ADMIN_EMAILS, user.email)) {
    return apiError(c, 403, 'forbidden');
  }
  const registered = await getDatabase(c.env.DB)
    .select({ id: passkey.id })
    .from(passkey)
    .where(eq(passkey.userId, user.id))
    .get();
  if (!registered) return apiError(c, 403, 'passkey_required');
  c.set('admin', { userId: user.id, email: user.email, name: user.name });
  await next();
});
