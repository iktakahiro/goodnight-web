import { createMiddleware } from 'hono/factory';
import type { HonoEnv } from '../../hono-env.ts';
import { apiError } from '../../shared/api-error.ts';
import { isAdminArea, requestArea } from '../../shared/request-path.ts';
import { readAccessConfig, verifyAccessJwt } from './access-jwt.ts';

/**
 * Optional Cloudflare Access check for the admin UI, the admin API, setup,
 * and Better Auth (see `isAdminArea`). Off unless `ACCESS_AUD` and
 * `ACCESS_TEAM_DOMAIN` are set. When on, every request to those areas needs
 * a valid `Cf-Access-Jwt-Assertion` header ({@link verifyAccessJwt}); it is
 * an extra layer in front of passkey sign-in, never a replacement for it.
 *
 * - 403 `access_denied` when the token is missing or invalid;
 * - 503 `access_unavailable` when only one of the two settings is set, or
 *   the team's signing keys cannot be fetched (fail closed).
 */
export const requireAccess = createMiddleware<HonoEnv>(async (c, next) => {
  const config = readAccessConfig(c.env);
  if (
    config.state === 'off' ||
    !isAdminArea(requestArea(c.req.url, c.req.path))
  ) {
    await next();
    return;
  }
  if (config.state === 'invalid') {
    return apiError(c, 503, 'access_unavailable');
  }
  const result = await verifyAccessJwt(
    config,
    c.req.header('cf-access-jwt-assertion') ?? null,
  );
  if (!result.ok) {
    console.warn(`cloudflare access: ${result.detail}`);
    return result.reason === 'unavailable'
      ? apiError(c, 503, 'access_unavailable')
      : apiError(c, 403, 'access_denied');
  }
  await next();
});
