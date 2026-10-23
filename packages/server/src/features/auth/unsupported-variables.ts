import type { GoodnightEnv } from '../../env.ts';

/**
 * Worker variables that Better Auth reads from `process.env` on its own and
 * that would change its security settings: extra trusted origins, or a
 * secret list that replaces `BETTER_AUTH_SECRET`. Workers fill
 * `process.env` from the Worker's vars and secrets, so goodnight-web turns
 * sign-in off while one of them is set.
 */
export const UNSUPPORTED_AUTH_VARIABLES = [
  'BETTER_AUTH_TRUSTED_ORIGINS',
  'BETTER_AUTH_SECRETS',
] as const;

/** Returns the {@link UNSUPPORTED_AUTH_VARIABLES} that are set in `env`. */
export const unsupportedAuthVariables = (
  env: GoodnightEnv,
): (typeof UNSUPPORTED_AUTH_VARIABLES)[number][] =>
  UNSUPPORTED_AUTH_VARIABLES.filter((name) => {
    const value: unknown = Reflect.get(env, name);
    return value !== undefined && value !== '';
  });
