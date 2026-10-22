import { createMiddleware } from 'hono/factory';
import type { HonoEnv } from '../../hono-env.ts';
import { requestArea } from '../../shared/request-path.ts';

/**
 * Content Security Policy for the admin UI. Only the Worker's own scripts,
 * styles, and API; no inline code, no framing. Tested with React, Base UI,
 * and Tailwind in docs/decisions/0004.
 */
export const ADMIN_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');

/** Content Security Policy for JSON and CSV API responses. */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'";

const COMMON_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), publickey-credentials-create=(self), publickey-credentials-get=(self)',
};

/**
 * Adds security headers to every response for `/api/*` and `/admin/*`. API
 * responses also get `Cache-Control: no-store`. HTTPS responses get HSTS.
 * Other responses passed through to Static Assets are not changed; the site
 * sets its own headers.
 *
 * The path is classified by the routed path and after normalization
 * ({@link requestArea}), so encoded or unusual spellings (`/%61dmin`,
 * `//admin`, `/admin/..%2f`, `/API/admin`) get the same headers as the
 * plain path.
 */
export const securityHeaders = createMiddleware<HonoEnv>(async (c, next) => {
  await next();
  const area = requestArea(c.req.url, c.req.path);
  if (area === 'site') return;
  const isAdminUi = area === 'admin-ui';
  // Responses from fetch() or Better Auth can have immutable headers.
  c.res = new Response(c.res.body, c.res);
  const headers = c.res.headers;
  for (const [name, value] of Object.entries(COMMON_HEADERS)) {
    headers.set(name, value);
  }
  headers.set('Content-Security-Policy', isAdminUi ? ADMIN_CSP : API_CSP);
  if (!isAdminUi) headers.set('Cache-Control', 'no-store');
  if (new URL(c.req.url).protocol === 'https:') {
    headers.set('Strict-Transport-Security', 'max-age=31536000');
  }
});
