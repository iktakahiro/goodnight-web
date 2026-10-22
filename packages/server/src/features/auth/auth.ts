import { passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import type { GoodnightEnv } from '../../env.ts';
import { createSetupPlugin } from '../setup/setup-plugin.ts';
import { AUTH_BASE_PATH } from './auth-paths.ts';

/** Shortest accepted `BETTER_AUTH_SECRET`, in characters. */
export const MIN_AUTH_SECRET_LENGTH = 32;

/**
 * Returns whether sign-in can run. Without a strong enough
 * `BETTER_AUTH_SECRET`, auth and the admin API answer 503 (fail closed).
 */
export const isAuthConfigured = (env: GoodnightEnv): boolean =>
  (env.BETTER_AUTH_SECRET?.length ?? 0) >= MIN_AUTH_SECRET_LENGTH;

const buildAuth = (env: GoodnightEnv, origin: string) =>
  betterAuth({
    appName: 'goodnight-web',
    baseURL: origin,
    basePath: AUTH_BASE_PATH,
    secret: env.BETTER_AUTH_SECRET,
    // Better Auth detects D1 and uses its own D1 dialect.
    database: env.DB as unknown as Parameters<typeof betterAuth>[0]['database'],
    emailAndPassword: { enabled: false },
    trustedOrigins: [origin],
    telemetry: { enabled: false },
    advanced: {
      // Never store raw IP addresses (the session table has an ipAddress
      // column). Contact rate limits use the HMAC ip_hash instead.
      ipAddress: { disableIpTracking: true },
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
          afterVerification: async ({ verification }) => {
            if (!verification.registrationInfo?.userVerified) {
              throw new APIError('UNAUTHORIZED', {
                message: 'user verification required',
              });
            }
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

// Building betterAuth() costs about 5 ms of CPU, close to the free plan's
// 10 ms limit, so instances are reused within an isolate. They are keyed by
// the env object (a new env means new bindings or secrets) and by origin
// (passkeys are bound to the hostname). See docs/decisions/0001.
const cache = new WeakMap<GoodnightEnv, Map<string, GoodnightAuth>>();

/**
 * Returns the Better Auth instance for this env and origin, building it on
 * first use in the isolate.
 *
 * Passkeys only: email and password sign-in is disabled. Passkey registration
 * and sign-in require user verification. IP tracking is off.
 *
 * Call {@link isAuthConfigured} first; this function does not check the
 * secret.
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
  if (!auth) {
    auth = buildAuth(env, origin);
    byOrigin.set(origin, auth);
  }
  return auth;
};
