/**
 * Shortest accepted value, in characters, for `SETUP_TOKEN`,
 * `IP_HASH_SECRET`, and `BETTER_AUTH_SECRET`. A shorter value turns the
 * features that use it off (fail closed).
 */
export const MIN_SECRET_LENGTH = 32;

/**
 * Fewest distinct characters a secret must contain. A random value from
 * `openssl rand -base64 32` (44 characters) has about 30; a value such as
 * `aaaa…` or `abcabc…` has far fewer.
 */
export const MIN_SECRET_DISTINCT_CHARACTERS = 10;

/**
 * State of a secret: `missing`, `too_short` (under
 * {@link MIN_SECRET_LENGTH}), `weak` (long enough but clearly not random:
 * fewer than {@link MIN_SECRET_DISTINCT_CHARACTERS} distinct characters, or
 * one block repeated), or `ok`.
 */
export type SecretState = 'ok' | 'missing' | 'too_short' | 'weak';

// Whether `value` is one shorter block repeated, such as `0123456789` four
// times.
const isRepeatedBlock = (value: string): boolean => {
  for (let size = 1; size <= value.length / 2; size++) {
    if (value.length % size !== 0) continue;
    if (value.slice(0, size).repeat(value.length / size) === value) return true;
  }
  return false;
};

/**
 * Returns the {@link SecretState} of `value`. This is a basic check that
 * catches placeholder and hand-typed values; it does not measure entropy.
 */
export const secretState = (value: string | undefined): SecretState => {
  if (!value) return 'missing';
  if (value.length < MIN_SECRET_LENGTH) return 'too_short';
  if (
    new Set(value).size < MIN_SECRET_DISTINCT_CHARACTERS ||
    isRepeatedBlock(value)
  ) {
    return 'weak';
  }
  return 'ok';
};

/** Returns whether `value` can be used as a secret ({@link secretState} is `ok`). */
export const isUsableSecret = (value: string | undefined): boolean =>
  secretState(value) === 'ok';
