import { Hono } from 'hono';
import type { HonoEnv } from '../../hono-env.ts';
import { apiError } from '../../shared/api-error.ts';
import { timingSafeEqual } from '../../shared/crypto.ts';
import { limitByIpHash } from '../../shared/ip-rate-limit.ts';
import { isAllowedOrigin, readBodyWithLimit } from '../../shared/request.ts';
import { isAdminEmail } from '../auth/admin-emails.ts';
import { getAuth, isAuthConfigured } from '../auth/auth.ts';
import { setupInputSchema } from './setup-schema.ts';
import { isSetupClosed, isSetupConfigured } from './setup-state.ts';

/** Body of `GET /api/setup`. */
export interface SetupState {
  /**
   * `SETUP_TOKEN`, `ADMIN_EMAILS`, `BETTER_AUTH_SECRET`, `IP_HASH_SECRET`,
   * and the `CONTACT_RATE_LIMITER` binding are set.
   */
  configured: boolean;
  /** Setup can run now: configured and no passkey was ever registered. */
  open: boolean;
}

const MAX_SETUP_BODY_BYTES = 4 * 1024;

/**
 * Routes under `/api/setup`, which create the first admin:
 *
 * - `GET /`: {@link SetupState}.
 * - `POST /` with `{ token, email, name? }`: checks `Origin`, the rate limit,
 *   that setup is not closed, `SETUP_TOKEN` (constant-time), and
 *   `ADMIN_EMAILS`. Then it creates the user and a session cookie. The browser
 *   registers a passkey next, and setup closes for good.
 */
export const setupRoutes = new Hono<HonoEnv>()
  .get('/', async (c) => {
    const configured = isSetupConfigured(c.env) && isAuthConfigured(c.env);
    const state: SetupState = {
      configured,
      open: configured && !(await isSetupClosed(c.env.DB)),
    };
    return c.json(state);
  })
  .post('/', async (c) => {
    const env = c.env;
    if (!isAuthConfigured(env)) return apiError(c, 503, 'auth_unavailable');
    if (!isSetupConfigured(env)) return apiError(c, 503, 'setup_unavailable');
    // Better Auth's own origin check is skipped for server-side calls, so
    // check here.
    if (!isAllowedOrigin(c.req.raw)) {
      return apiError(c, 403, 'forbidden_origin');
    }
    if (
      !/^application\/json\s*(;|$)/i.test(c.req.header('content-type') ?? '')
    ) {
      return apiError(c, 415, 'unsupported_media_type');
    }
    const bodyText = await readBodyWithLimit(c.req.raw, MAX_SETUP_BODY_BYTES);
    if (bodyText === null) return apiError(c, 413, 'payload_too_large');
    let raw: unknown;
    try {
      raw = JSON.parse(bodyText);
    } catch {
      return apiError(c, 400, 'invalid_json');
    }

    const limit = await limitByIpHash(env, c.req.raw, 'setup');
    if (limit === 'unavailable') return apiError(c, 503, 'setup_unavailable');
    if (limit === 'limited') return apiError(c, 429, 'rate_limited');

    if (await isSetupClosed(env.DB)) return apiError(c, 403, 'setup_closed');

    const parsed = setupInputSchema.safeParse(raw);
    if (!parsed.success) return apiError(c, 400, 'invalid_input');
    const { token, email, name } = parsed.data;
    if (!timingSafeEqual(token, env.SETUP_TOKEN ?? '')) {
      return apiError(c, 403, 'invalid_setup_token');
    }
    if (!isAdminEmail(env.ADMIN_EMAILS, email)) {
      return apiError(c, 403, 'email_not_allowed');
    }

    const auth = getAuth(env, new URL(c.req.url).origin);
    const result = await auth.api.createFirstAdmin({
      body: {
        email: email.toLowerCase(),
        name: name || email.split('@')[0] || email,
      },
      headers: c.req.raw.headers,
      asResponse: true,
    });
    if (!result.ok) return apiError(c, 403, 'setup_closed');
    const response = c.json({ ok: true });
    for (const cookie of result.headers.getSetCookie()) {
      response.headers.append('set-cookie', cookie);
    }
    return response;
  });
