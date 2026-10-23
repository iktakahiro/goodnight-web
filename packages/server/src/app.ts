import { Hono } from 'hono';
import { adminRoutes } from './features/admin-api/admin-routes.ts';
import { serveAdminFile } from './features/admin-ui/serve-admin-file.ts';
import { authRoutes } from './features/auth/auth-routes.ts';
import { requireAccess } from './features/cloudflare-access/require-access.ts';
import { contactRoutes } from './features/contact/contact-routes.ts';
import { requireHttps } from './features/https-only/require-https.ts';
import { securityHeaders } from './features/security-headers/security-headers.ts';
import { setupRoutes } from './features/setup/setup-routes.ts';
import type { HonoEnv } from './hono-env.ts';
import { resolveOptions, type GoodnightWorkerOptions } from './options.ts';
import { apiError } from './shared/api-error.ts';
import { resolveAppSecret } from './shared/app-secret.ts';
import { safeErrorMessage } from './shared/log-error.ts';

/**
 * Creates the goodnight-web Worker: a Hono app that serves the contact API,
 * first-admin setup, Better Auth (passkeys), the admin API, and the prebuilt
 * admin UI. Every other request goes to the `ASSETS` binding.
 *
 * Use it as the Worker's default export:
 *
 * ```ts
 * import { createGoodnightWorker } from '@goodnight-web/server';
 *
 * export default createGoodnightWorker({ locale: 'ja' });
 * ```
 *
 * `wrangler.jsonc` must send `/api/*`, `/admin`, and `/admin/*` to the Worker
 * first (`assets.run_worker_first`), bind D1 as `DB`, and bind the Rate
 * Limiting binding as `CONTACT_RATE_LIMITER`.
 *
 * Routes:
 *
 * - `GET /api/contact/form`, `POST /api/contact`
 * - `GET /api/setup`, `POST /api/setup`
 * - `GET|POST /api/auth/*` (Better Auth)
 * - `/api/admin/*` (admin session with a passkey required)
 * - `GET /admin`, `GET /admin/*` (admin UI)
 *
 * The admin UI, the admin API, setup, and Better Auth require HTTPS (plain
 * HTTP is allowed on `localhost`), and a valid Cloudflare Access token when
 * `ACCESS_AUD` and `ACCESS_TEAM_DOMAIN` are set.
 *
 * Before any route runs, `c.env` is replaced by the resolved env, in which
 * `APP_SECRET` stands in for `SETUP_TOKEN`, `BETTER_AUTH_SECRET`, and
 * `IP_HASH_SECRET` when they are not set (`resolveAppSecret`).
 */
export const createGoodnightWorker = (options: GoodnightWorkerOptions = {}) => {
  const resolved = resolveOptions(options);
  const app = new Hono<HonoEnv>();
  app.use('*', async (c, next) => {
    c.env = await resolveAppSecret(c.env);
    c.set('options', resolved);
    await next();
  });
  app.use('*', securityHeaders);
  // The admin UI, admin API, setup, and Better Auth: HTTPS only (except on
  // localhost), then Cloudflare Access when ACCESS_AUD and
  // ACCESS_TEAM_DOMAIN are set.
  app.use('*', requireHttps);
  app.use('*', requireAccess);
  app.route('/api/contact', contactRoutes);
  app.route('/api/setup', setupRoutes);
  app.route('/api/auth', authRoutes);
  app.route('/api/admin', adminRoutes);
  app.all('/api/*', (c) => apiError(c, 404, 'not_found'));
  app.on(['GET', 'HEAD'], ['/admin', '/admin/*'], (c) =>
    serveAdminFile(c.req.raw),
  );
  app.all('*', (c) =>
    c.env.ASSETS
      ? (c.env.ASSETS.fetch(
          c.req.raw as unknown as Parameters<typeof c.env.ASSETS.fetch>[0],
        ) as unknown as Promise<Response>)
      : c.notFound(),
  );
  app.onError((error, c) => {
    console.error('unhandled error:', safeErrorMessage(error));
    return apiError(c, 500, 'server_error');
  });
  return app;
};
