import type { GoodnightEnv } from '../env.ts';
import { secretState, type SecretState } from './secret-length.ts';

const encoder = new TextEncoder();

/**
 * HKDF `info` labels, one per key derived from `APP_SECRET`. A different
 * label gives an unrelated key, so the session signing key and the IP hash
 * key never share a value. Changing a label changes the key: every session
 * becomes invalid and every new IP hash differs. Treat them as fixed.
 */
export const APP_SECRET_LABELS = {
  BETTER_AUTH_SECRET: 'goodnight-web:better-auth',
  IP_HASH_SECRET: 'goodnight-web:ip-hash',
} as const;

/** A secret that is derived from `APP_SECRET` when it is not set itself. */
export type DerivedSecretName = keyof typeof APP_SECRET_LABELS;

/** A secret that `APP_SECRET` can stand in for. */
export type AppSecretBackedName = DerivedSecretName | 'SETUP_TOKEN';

/**
 * Derives a key from `appSecret` with HKDF-SHA-256 (RFC 5869) through Web
 * Crypto: an empty salt (RFC 5869 then uses a string of zero bytes),
 * `label` as `info`, and 32 bytes of output.
 *
 * @returns The 32 bytes as 64 lowercase hex characters, so the key passes
 *   the same length check as a secret that is set by hand.
 */
export const deriveAppSecretKey = async (
  appSecret: string,
  label: string,
): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(appSecret),
    'HKDF',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: encoder.encode(label),
    },
    key,
    256,
  );
  return [...new Uint8Array(bits)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

// The resolved env of each env object, for the APP_SECRET and explicit
// BETTER_AUTH_SECRET values it was resolved with (together they decide the
// signing key), and the env object of each resolved env.
const resolvedEnvs = new WeakMap<
  GoodnightEnv,
  {
    appSecret: string | null;
    authSecret: string | undefined;
    resolved: GoodnightEnv;
  }
>();
const sourceEnvs = new WeakMap<GoodnightEnv, GoodnightEnv>();

const usableAppSecret = (env: GoodnightEnv): string | null =>
  env.APP_SECRET && secretState(env.APP_SECRET) === 'ok'
    ? env.APP_SECRET
    : null;

// A view of `source` that reads every property from it on each access, so a
// changed value is seen at once, and fills in the secrets that `appSecret`
// stands in for. The filled-in values are used only while `source` still
// has that APP_SECRET, so a stale view never hands out old keys. The proxy
// target is an empty object, so no proxy invariant ties the filled-in values
// to the source's own property attributes.
const createResolvedEnv = (
  source: GoodnightEnv,
  appSecret: string | null,
  keys: Record<DerivedSecretName, string> | null,
): GoodnightEnv => {
  const current = () => usableAppSecret(source) === appSecret;
  const read = (name: PropertyKey): unknown => {
    if (name === 'BETTER_AUTH_SECRET' || name === 'IP_HASH_SECRET') {
      return source[name] || (keys && current() ? keys[name] : undefined);
    }
    if (name === 'SETUP_TOKEN') {
      return (
        source.SETUP_TOKEN || (appSecret && current() ? appSecret : undefined)
      );
    }
    return Reflect.get(source, name);
  };
  const has = (name: PropertyKey): boolean =>
    Reflect.has(source, name) || read(name) !== undefined;
  return new Proxy({} as GoodnightEnv, {
    get: (_target, name) => read(name),
    has: (_target, name) => has(name),
    set: (_target, name, value) => Reflect.set(source, name, value),
    ownKeys: () => [
      ...new Set([
        ...Reflect.ownKeys(source),
        ...(['SETUP_TOKEN', ...Object.keys(APP_SECRET_LABELS)] as const).filter(
          (name) => read(name) !== undefined,
        ),
      ]),
    ],
    getOwnPropertyDescriptor: (_target, name) =>
      has(name)
        ? {
            value: read(name),
            writable: true,
            enumerable: true,
            configurable: true,
          }
        : undefined,
  });
};

/**
 * Returns the env that the Worker reads its settings from. It is `env` with
 * the secrets that `APP_SECRET` stands in for filled in:
 *
 * - `BETTER_AUTH_SECRET` and `IP_HASH_SECRET`: the value set in `env`, or
 *   when it is unset or empty, a key derived from `APP_SECRET`
 *   ({@link deriveAppSecretKey} with {@link APP_SECRET_LABELS}).
 * - `SETUP_TOKEN`: the value set in `env`, or when it is unset or empty,
 *   `APP_SECRET` itself.
 *
 * A value set in `env` always wins and is checked as before; a value that
 * is set but too short is never replaced. `APP_SECRET` stands in only when
 * it is at least `MIN_SECRET_LENGTH` characters (`secretState` is `ok`);
 * otherwise nothing is filled in and the features that need the secrets stay
 * off (fail closed).
 *
 * Changing or removing `APP_SECRET` changes the derived keys: sessions
 * signed with the old key stop working, and IP hashes (rate limits and the
 * stored `ip_hash`) change.
 *
 * The result is the same object for the same `env`, `APP_SECRET` and
 * `BETTER_AUTH_SECRET`, so caches keyed by the env object (Better Auth,
 * docs/decisions/0001) keep working, and a new object when either value
 * changes, so they are not reused with an old signing key. Other properties are read from `env` on every
 * access. Passing a resolved env returns it unchanged. Nothing here logs or
 * stores a secret.
 */
export const resolveAppSecret = async (
  env: GoodnightEnv,
): Promise<GoodnightEnv> => {
  if (typeof env !== 'object' || env === null || sourceEnvs.has(env)) {
    return env;
  }
  const appSecret = usableAppSecret(env);
  const cached = resolvedEnvs.get(env);
  const authSecret = env.BETTER_AUTH_SECRET;
  if (
    cached &&
    cached.appSecret === appSecret &&
    cached.authSecret === authSecret
  ) {
    return cached.resolved;
  }
  let keys: Record<DerivedSecretName, string> | null = null;
  if (appSecret !== null) {
    const [betterAuth, ipHash] = await Promise.all([
      deriveAppSecretKey(appSecret, APP_SECRET_LABELS.BETTER_AUTH_SECRET),
      deriveAppSecretKey(appSecret, APP_SECRET_LABELS.IP_HASH_SECRET),
    ]);
    keys = { BETTER_AUTH_SECRET: betterAuth, IP_HASH_SECRET: ipHash };
  }
  const resolved = createResolvedEnv(env, appSecret, keys);
  resolvedEnvs.set(env, { appSecret, authSecret, resolved });
  sourceEnvs.set(resolved, env);
  return resolved;
};

/** A secret that keeps a feature off, by the name the owner should set. */
export interface SecretProblem {
  name: AppSecretBackedName | 'APP_SECRET';
  issue: Exclude<SecretState, 'ok'>;
}

/**
 * Says which variable to fix when the secret `name` cannot be used, or
 * returns `null` when it can. A value set for `name` itself is reported
 * under `name` (for example `BETTER_AUTH_SECRET` that is too short).
 * Otherwise `APP_SECRET` is reported, because setting it is what fills the
 * secret in. Names only; never values.
 *
 * @param env - A resolved env ({@link resolveAppSecret}).
 */
export const secretProblem = (
  env: GoodnightEnv,
  name: AppSecretBackedName,
): SecretProblem | null => {
  const value = env[name];
  const state = secretState(value);
  if (state === 'ok') return null;
  if (value) return { name, issue: state };
  const appSecret = secretState(env.APP_SECRET);
  return appSecret === 'ok'
    ? { name, issue: 'missing' }
    : { name: 'APP_SECRET', issue: appSecret };
};

/**
 * Returns the variable whose value the setup form accepts: `SETUP_TOKEN`
 * when it is set, otherwise `APP_SECRET`.
 *
 * @param env - A resolved env ({@link resolveAppSecret}) or a plain one.
 */
export const setupTokenName = (
  env: GoodnightEnv,
): 'SETUP_TOKEN' | 'APP_SECRET' =>
  (sourceEnvs.get(env) ?? env).SETUP_TOKEN ? 'SETUP_TOKEN' : 'APP_SECRET';
