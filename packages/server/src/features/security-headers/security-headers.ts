import { createMiddleware } from 'hono/factory';
import type { HonoEnv } from '../../hono-env.ts';

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
 * Adds security headers to every response the Worker builds for `/api/*` and
 * `/admin/*`. API responses also get `Cache-Control: no-store`. HTTPS
 * responses get HSTS. Responses passed through to Static Assets are not
 * changed; the site sets its own headers.
 */
export const securityHeaders = createMiddleware<HonoEnv>(async (c, next) => {
  await next();
  const { pathname, protocol } = new URL(c.req.url);
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');
  const isApi = pathname.startsWith('/api/');
  if (!isAdmin && !isApi) return;
  // Responses from fetch() or Better Auth can have immutable headers.
  c.res = new Response(c.res.body, c.res);
  const headers = c.res.headers;
  for (const [name, value] of Object.entries(COMMON_HEADERS)) {
    headers.set(name, value);
  }
  headers.set('Content-Security-Policy', isAdmin ? ADMIN_CSP : API_CSP);
  if (isApi) headers.set('Cache-Control', 'no-store');
  if (protocol === 'https:') {
    headers.set('Strict-Transport-Security', 'max-age=31536000');
  }
});
