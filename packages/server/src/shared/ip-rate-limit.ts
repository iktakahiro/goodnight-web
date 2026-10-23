import type { GoodnightEnv } from '../env.ts';
import { hmacSha256Hex } from './crypto.ts';
import { isLongEnough } from './secret-length.ts';

/** Result of {@link limitByIpHash}. */
export type IpRateLimitResult = 'allowed' | 'limited' | 'unavailable';

const IPV4 =
  /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const HEXTET = /^[0-9a-f]{1,4}$/;

// Parses an IPv6 address into eight 16-bit groups, or returns null.
const parseIpv6 = (address: string): number[] | null => {
  let text = address.toLowerCase().replace(/^\[|\]$/g, '');
  const zone = text.indexOf('%');
  if (zone !== -1) text = text.slice(0, zone);
  const tail: number[] = [];
  const lastColon = text.lastIndexOf(':');
  const last = text.slice(lastColon + 1);
  if (last.includes('.')) {
    if (lastColon === -1 || !IPV4.test(last)) return null;
    const [a = 0, b = 0, c = 0, d = 0] = last.split('.').map(Number);
    tail.push((a << 8) | b, (c << 8) | d);
    text = text.slice(0, lastColon + 1);
    if (!text.endsWith('::')) text = text.slice(0, -1);
  }
  const want = 8 - tail.length;
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const toGroups = (part: string): number[] | null => {
    if (part === '') return [];
    const groups: number[] = [];
    for (const group of part.split(':')) {
      if (!HEXTET.test(group)) return null;
      groups.push(Number.parseInt(group, 16));
    }
    return groups;
  };
  const head = toGroups(halves[0] ?? '');
  if (!head) return null;
  if (halves.length === 1) {
    return head.length === want ? [...head, ...tail] : null;
  }
  const rest = toGroups(halves[1] ?? '');
  if (!rest || head.length + rest.length >= want) return null;
  const zeros = Array<number>(want - head.length - rest.length).fill(0);
  return [...head, ...zeros, ...rest, ...tail];
};

/**
 * Returns what a rate limit counts for a client address: an IPv4 address as
 * it is, an IPv4-mapped IPv6 address (`::ffff:192.0.2.1`) as its IPv4
 * address, and any other IPv6 address as its /64 prefix
 * (`2001:db8:1:2::/64`). One IPv6 subscriber usually holds a whole /64, so
 * counting single addresses would give one client billions of counters.
 * A value that is not an IP address is returned as it is.
 *
 * The result is only ever hashed ({@link ipRateLimitKey}); it is never
 * stored or logged.
 */
export const ipRateLimitSubject = (ip: string): string => {
  if (IPV4.test(ip)) return ip;
  const groups = parseIpv6(ip);
  if (!groups) return ip;
  const mapped =
    groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  if (mapped) {
    const [g6 = 0, g7 = 0] = groups.slice(6);
    return [g6 >> 8, g6 & 0xff, g7 >> 8, g7 & 0xff].join('.');
  }
  return `${groups
    .slice(0, 4)
    .map((group) => group.toString(16))
    .join(':')}::/64`;
};

/**
 * Returns `HMAC-SHA256(ipRateLimitSubject(ip), secret)` as hex: the rate
 * limit key for a client. `null` (no `CF-Connecting-IP`) counts as
 * `unknown`.
 */
export const ipRateLimitKey = (
  secret: string,
  ip: string | null | undefined,
): Promise<string> =>
  hmacSha256Hex(secret, ipRateLimitSubject(ip ?? 'unknown'));

/**
 * Counts a request against `CONTACT_RATE_LIMITER`, keyed by
 * `<scope>:` and {@link ipRateLimitKey} (an IPv6 client counts by its /64
 * prefix). The raw IP is never stored.
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
  const key = await ipRateLimitKey(
    secret,
    request.headers.get('cf-connecting-ip'),
  );
  const { success } = await limiter.limit({ key: `${scope}:${key}` });
  return success ? 'allowed' : 'limited';
};
