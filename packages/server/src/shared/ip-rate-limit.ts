import type { GoodnightEnv } from '../env.ts';
import { hmacSha256Hex } from './crypto.ts';
import { isLongEnough } from './secret-length.ts';

/** Result of {@link limitByIpHash}. */
export type IpRateLimitResult = 'allowed' | 'limited' | 'unavailable';

/**
 * Counts a request against `CONTACT_RATE_LIMITER`, keyed by
 * `<scope>:HMAC-SHA256(ip, IP_HASH_SECRET)`. The raw IP is never stored.
 *
 * @param scope - Key prefix, so each feature has its own counter.
 * @returns `unavailable` when the binding is missing or `IP_HASH_SECRET` is
 *   missing or shorter than `MIN_SECRET_LENGTH`. Callers answer 503 then
 *   (fail closed).
 */
export const limitByIpHash = async (
  env: GoodnightEnv,
  request: Request,
  scope: string,
): Promise<IpRateLimitResult> => {
  const limiter = env.CONTACT_RATE_LIMITER;
  const secret = env.IP_HASH_SECRET;
  if (
    typeof limiter?.limit !== 'function' ||
    !secret ||
    !isLongEnough(secret)
  ) {
    return 'unavailable';
  }
  const ipHash = await hmacSha256Hex(
    secret,
    request.headers.get('cf-connecting-ip') ?? 'unknown',
  );
  const { success } = await limiter.limit({ key: `${scope}:${ipHash}` });
  return success ? 'allowed' : 'limited';
};
