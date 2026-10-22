import { Hono } from 'hono';
import * as z from 'zod';
import type { HonoEnv } from '../../hono-env.ts';
import { apiError } from '../../shared/api-error.ts';
import { hmacSha256Hex, timingSafeEqual } from '../../shared/crypto.ts';
import { isAllowedOrigin, readBodyWithLimit } from '../../shared/request.ts';
import { isAdminEmail } from '../auth/admin-emails.ts';
import { getAuth, isAuthConfigured } from '../auth/auth.ts';
import { isSetupClosed, isSetupConfigured } from './setup-state.ts';

/** Body of `GET /api/setup`. */
export interface SetupState {
  /** `SETUP_TOKEN`, `ADMIN_EMAILS`, and `BETTER_AUTH_SECRET` are set. */
  configured: boolean;
  /** Setup can run now: configured and no passkey exists yet. */
  open: boolean;
}

const MAX_SETUP_BODY_BYTES = 4 * 1024;

const setupBodySchema = z.object({
  token: z.string().min(1).max(512),
  email: z.string().trim().pipe(z.email().max(254)),
  name: z.string().trim().max(100).optional(),
});

/**
 * Routes under `/api/setup`, which create the first admin:
 *
 * - `GET /`: {@link SetupState}.
 * - `POST /` with `{ token, email, name? }`: checks `Origin`, the rate limit,
 *   that no passkey exists, `SETUP_TOKEN` (constant-time), and `ADMIN_EMAILS`.
 *   Then it creates the user and a session cookie. The browser registers a
 *   passkey next, and setup closes.
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

    if (env.CONTACT_RATE_LIMITER && env.IP_HASH_SECRET) {
      const ipHash = await hmacSha256Hex(
        env.IP_HASH_SECRET,
        c.req.header('cf-connecting-ip') ?? 'unknown',
      );
      const { success } = await env.CONTACT_RATE_LIMITER.limit({
        key: `setup:${ipHash}`,
      });
      if (!success) return apiError(c, 429, 'rate_limited');
    }

    if (await isSetupClosed(env.DB)) return apiError(c, 403, 'setup_closed');

    const parsed = setupBodySchema.safeParse(raw);
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
