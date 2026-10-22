/**
 * Shortest accepted value, in characters, for `SETUP_TOKEN`,
 * `IP_HASH_SECRET`, and `BETTER_AUTH_SECRET`. A shorter value turns the
 * features that use it off (fail closed).
 */
export const MIN_SECRET_LENGTH = 32;

/** State of a secret with a minimum length. */
export type SecretState = 'ok' | 'missing' | 'too_short';

/** Returns whether `value` is set and at least {@link MIN_SECRET_LENGTH} long. */
export const secretState = (value: string | undefined): SecretState =>
  !value ? 'missing' : value.length < MIN_SECRET_LENGTH ? 'too_short' : 'ok';

/** Returns whether `value` is set and long enough ({@link secretState}). */
export const isLongEnough = (value: string | undefined): boolean =>
  secretState(value) === 'ok';
