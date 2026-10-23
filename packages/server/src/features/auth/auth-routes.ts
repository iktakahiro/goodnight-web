import { Hono } from 'hono';
import type { HonoEnv } from '../../hono-env.ts';
import { apiError } from '../../shared/api-error.ts';
import { limitByIpHash } from '../../shared/ip-rate-limit.ts';
import { safeErrorMessage } from '../../shared/log-error.ts';
import { isJsonContentType, readBytesWithLimit } from '../../shared/request.ts';
import { pruneIfDue } from '../retention/prune.ts';
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
 * Largest accepted request body under `/api/auth/*`, in bytes. Passkey
 * registration and sign-in responses (with the attestation object and
 * client data) are a few KiB; sign-out and passkey management bodies are
 * smaller. A larger body gets 413 before Better Auth reads it.
 */
export const AUTH_MAX_BODY_BYTES = 64 * 1024;

/**
 * Reads a Better Auth request body under {@link AUTH_MAX_BODY_BYTES} and
 * returns a new request that carries only the bytes that were read. Better
 * Auth buffers and parses the whole body before its own checks, so the
 * request it gets must already be bounded.
 *
 * A body must be sent as `application/json` (the media type exactly, not a
 * type that contains it). A request with no body, such as a sign-out without
 * a payload, may leave `Content-Type` out.
 */
const boundedAuthRequest = async (
  request: Request,
): Promise<Request | 'too_large' | 'unsupported_media_type'> => {
  const contentType = request.headers.get('content-type');
  if (contentType !== null && !isJsonContentType(contentType)) {
    return 'unsupported_media_type';
  }
  const bytes = await readBytesWithLimit(request, AUTH_MAX_BODY_BYTES);
  if (bytes === null) return 'too_large';
  if (bytes.byteLength > 0 && contentType === null) {
    return 'unsupported_media_type';
  }
  const headers = new Headers(request.headers);
  headers.delete('content-length');
  return new Request(request.url, {
    method: request.method,
    headers,
    body: bytes.byteLength > 0 ? bytes : null,
  });
};

/**
 * `/api/auth/*`: Better Auth's handler (passkey registration and sign-in,
 * session, sign-out). Answers 503 when `BETTER_AUTH_SECRET` is missing.
 *
 * A `POST` body must be `application/json` (415 otherwise) and at most
 * {@link AUTH_MAX_BODY_BYTES} (413 otherwise). Both are checked before
 * Better Auth sees the request.
 *
 * The public passkey sign-in endpoints count against `CONTACT_RATE_LIMITER`
 * with the key `auth:<ip_hash>` (429 over the limit). Without the binding or
 * `IP_HASH_SECRET` they answer 503. An allowed call also runs `pruneIfDue`
 * in `ctx.waitUntil`.
 */
export const authRoutes = new Hono<HonoEnv>().on(
  ['GET', 'POST'],
  '/*',
  async (c) => {
    if (!isAuthConfigured(c.env)) return apiError(c, 503, 'auth_unavailable');
    let request = c.req.raw;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const bounded = await boundedAuthRequest(request);
      if (bounded === 'too_large') {
        return apiError(c, 413, 'payload_too_large');
      }
      if (bounded === 'unsupported_media_type') {
        return apiError(c, 415, 'unsupported_media_type');
      }
      request = bounded;
    }
    if (PUBLIC_SIGN_IN_PATHS.has(authEndpoint(c.req.path))) {
      const limit = await limitByIpHash(c.env, request, 'auth');
      if (limit === 'unavailable') {
        return apiError(c, 503, 'auth_unavailable');
      }
      if (limit === 'limited') return apiError(c, 429, 'rate_limited');
      // Abandoned challenges pile up in `verification` on a site that gets
      // sign-in attempts but no inquiries, so sign-in triggers pruning too.
      c.executionCtx.waitUntil(
        pruneIfDue(c.env.DB).catch((error: unknown) => {
          console.error('prune failed:', safeErrorMessage(error));
        }),
      );
    }
    return getAuth(c.env, new URL(c.req.url).origin).handler(request);
  },
);
