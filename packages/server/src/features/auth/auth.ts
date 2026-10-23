import { passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { getDatabase } from '../../db/database.ts';
import * as schema from '../../db/schema.ts';
import { redactQueryText, safeErrorMessage } from '../../shared/log-error.ts';
import { isUsableSecret } from '../../shared/secret-length.ts';
import type { GoodnightEnv } from '../../env.ts';
import { beforePasskeySaved } from '../setup/first-passkey.ts';
import { createSetupPlugin } from '../setup/setup-plugin.ts';
import { AUTH_BASE_PATH } from './auth-paths.ts';
import { unsupportedAuthVariables } from './unsupported-variables.ts';

/**
 * Returns whether sign-in can run. Without a usable `BETTER_AUTH_SECRET`
 * (at least `MIN_SECRET_LENGTH` characters and not weak), or while one of the
 * `UNSUPPORTED_AUTH_VARIABLES` is set, auth and the admin API answer
 * 503 (fail closed).
 */
export const isAuthConfigured = (env: GoodnightEnv): boolean =>
  isUsableSecret(env.BETTER_AUTH_SECRET) &&
  unsupportedAuthVariables(env).length === 0;

const buildAuth = (env: GoodnightEnv, origin: string) =>
  betterAuth({
    appName: 'goodnight-web',
    baseURL: origin,
    basePath: AUTH_BASE_PATH,
    secret: env.BETTER_AUTH_SECRET,
    // The same Drizzle schema and migrations as the app tables
    // (docs/decisions/0005).
    database: drizzleAdapter(getDatabase(env.DB), {
      provider: 'sqlite',
      schema,
    }),
    emailAndPassword: { enabled: false },
    trustedOrigins: [origin],
    telemetry: { enabled: false },
    logger: {
      // Better Auth passes errors, query conditions, and error messages to
      // the logger. A failed query carries its bound values (addresses,
      // session tokens), so only redacted text and safe error messages are
      // logged.
      log: (level, message, ...args: unknown[]) => {
        const errors = args
          .filter((arg) => arg instanceof Error)
          .map(safeErrorMessage);
        console[level](`better-auth: ${redactQueryText(message)}`, ...errors);
      },
    },
    // Rethrow errors from HTTP endpoints. Otherwise Better Call logs a
    // non-API error object with console.error, bypassing the logger above.
    // Rethrown errors reach the app's onError, which logs only
    // safeErrorMessage. API errors still become their HTTP responses.
    onAPIError: { throw: true },
    advanced: {
      // Better Auth turns its Origin and CSRF checks off by default when
      // `NODE_ENV` is `test` or a `TEST` variable is set, and Workers fill
      // `process.env` from the Worker's vars and secrets. Set both
      // explicitly, so no variable name can turn the checks off. (Its other
      // test-mode paths only skip secret warnings, which isAuthConfigured
      // replaces, and an IP fallback that disableIpTracking bypasses.)
      disableOriginCheck: false,
      disableCSRFCheck: false,
      // Never store raw IP addresses (the session table has an ip_address
      // column). Contact rate limits use the HMAC ip_hash instead.
      ipAddress: { disableIpTracking: true },
      // Load joined rows (a session's user) in the same query through the
      // schema's relations. The fallback runs a second query and logs its
      // error object with console.error, bound values included.
      database: { joins: true },
    },
    plugins: [
      passkey({
        rpID: new URL(origin).hostname,
        rpName: 'goodnight-web',
        origin,
        authenticatorSelection: {
          residentKey: 'required',
          userVerification: 'required',
        },
        // The plugin verifies with requireUserVerification: false, so enforce
        // user verification (PIN or biometrics) here.
        registration: {
          afterVerification: async ({ ctx, verification, user }) => {
            if (!verification.registrationInfo?.userVerified) {
              throw new APIError('UNAUTHORIZED', {
                message: 'user verification required',
              });
            }
            await beforePasskeySaved(env.DB, {
              userId: user.id,
              sessionCreatedAt: ctx.context.session?.session.createdAt,
              request: ctx.context,
            });
          },
        },
        authentication: {
          afterVerification: async ({ verification }) => {
            if (!verification.authenticationInfo.userVerified) {
              throw new APIError('UNAUTHORIZED', {
                message: 'user verification required',
              });
            }
          },
        },
      }),
      createSetupPlugin(env),
    ],
  });

/** The Better Auth instance used by the Worker. */
export type GoodnightAuth = ReturnType<typeof buildAuth>;

/**
 * Most Better Auth instances kept per env object, one per origin. A site
 * normally has one or two origins (its domain and workers.dev). With a
 * wildcard route, any client could add origins, so the least recently used
 * instance is dropped beyond this number.
 */
export const MAX_AUTH_INSTANCES_PER_ENV = 8;

// Building betterAuth() costs about 5 ms of CPU, close to the free plan's
// 10 ms limit, so instances are reused within an isolate. They are keyed by
// the env object (a new env means new bindings or secrets) and by origin
// (passkeys are bound to the hostname). See docs/decisions/0001. A Map keeps
// insertion order, so re-inserting on use makes the first key the least
// recently used.
const cache = new WeakMap<GoodnightEnv, Map<string, GoodnightAuth>>();

/**
 * Returns the Better Auth instance for this env and origin, building it on
 * first use in the isolate.
 *
 * Passkeys only: email and password sign-in is disabled. Passkey registration
 * and sign-in require user verification. IP tracking is off. The first
 * passkey claims setup atomically, then deletes every session
 * (`beforePasskeySaved`).
 *
 * Call {@link isAuthConfigured} first; this function does not check the
 * secret.
 *
 * At most {@link MAX_AUTH_INSTANCES_PER_ENV} instances are kept per env;
 * the least recently used one is dropped first.
 *
 * @param origin - The request's origin. It sets the passkey relying party ID
 *   and the trusted origin.
 */
export const getAuth = (env: GoodnightEnv, origin: string): GoodnightAuth => {
  let byOrigin = cache.get(env);
  if (!byOrigin) {
    byOrigin = new Map();
    cache.set(env, byOrigin);
  }
  let auth = byOrigin.get(origin);
  if (auth) {
    byOrigin.delete(origin);
  } else {
    auth = buildAuth(env, origin);
    for (const oldest of byOrigin.keys()) {
      if (byOrigin.size < MAX_AUTH_INSTANCES_PER_ENV) break;
      byOrigin.delete(oldest);
    }
  }
  byOrigin.set(origin, auth);
  return auth;
};
