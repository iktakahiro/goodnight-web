import type { GoodnightEnv } from '../../env.ts';

/** Cloudflare Access settings from `env`, after {@link readAccessConfig}. */
export type AccessConfig =
  | { state: 'off' }
  /** Only one of `ACCESS_AUD` and `ACCESS_TEAM_DOMAIN` is set (fail closed). */
  | { state: 'invalid' }
  | { state: 'on'; audiences: string[]; teamOrigin: string };

/**
 * Reads `ACCESS_AUD` and `ACCESS_TEAM_DOMAIN`. Verification is on only when
 * both are set; when only one is set, or the team domain is not a host name,
 * the config is `invalid` and the protected areas answer 503.
 */
export const readAccessConfig = (env: GoodnightEnv): AccessConfig => {
  const audiences = (env.ACCESS_AUD ?? '')
    .split(',')
    .map((aud) => aud.trim())
    .filter((aud) => aud !== '');
  const domain = (env.ACCESS_TEAM_DOMAIN ?? '')
    .trim()
    .replace(/^https:\/\//, '')
    .replace(/\/+$/, '')
    .toLowerCase();
  if (audiences.length === 0 && domain === '') return { state: 'off' };
  if (audiences.length === 0 || !/^[a-z0-9.-]+$/.test(domain)) {
    return { state: 'invalid' };
  }
  return { state: 'on', audiences, teamOrigin: `https://${domain}` };
};

/** Result of {@link verifyAccessJwt}. */
export type AccessJwtResult =
  | { ok: true }
  /** The token is missing, malformed, expired, or for another app. */
  | { ok: false; reason: 'denied'; detail: string }
  /** The team's signing keys could not be fetched. */
  | { ok: false; reason: 'unavailable'; detail: string };

interface KeySet {
  keys: Map<string, CryptoKey>;
  fetchedAt: number;
}

/** How long fetched signing keys are reused (Access rotates them slowly). */
export const ACCESS_KEYS_TTL_MS = 60 * 60 * 1000;

// An unknown `kid` refetches the keys at most this often, so forged tokens
// cannot make the Worker fetch the key set on every request.
const REFETCH_MIN_INTERVAL_MS = 30 * 1000;

/**
 * After a failed fetch of the signing keys, requests fail closed without
 * fetching again for this long, so a failing certs endpoint is not called
 * on every admin request.
 */
export const ACCESS_KEYS_FAILURE_BACKOFF_MS = 10 * 1000;

// Public signing keys per team origin, shared within the isolate. They are
// public data, not secrets.
const keyCache = new Map<string, KeySet>();
// Time of the last failed fetch per team origin.
const failedAt = new Map<string, number>();

const RS256 = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } as const;

const fetchKeys = async (teamOrigin: string, now: number): Promise<KeySet> => {
  const failed = failedAt.get(teamOrigin);
  if (failed !== undefined && now - failed < ACCESS_KEYS_FAILURE_BACKOFF_MS) {
    throw new Error('certs fetch failed recently');
  }
  try {
    const set = await fetchKeySet(teamOrigin, now);
    failedAt.delete(teamOrigin);
    return set;
  } catch (error) {
    failedAt.set(teamOrigin, now);
    throw error;
  }
};

const fetchKeySet = async (
  teamOrigin: string,
  now: number,
): Promise<KeySet> => {
  const response = await fetch(`${teamOrigin}/cdn-cgi/access/certs`);
  if (!response.ok) throw new Error(`certs status ${response.status}`);
  const body: unknown = await response.json();
  const list =
    typeof body === 'object' && body !== null && 'keys' in body
      ? (body as { keys: unknown }).keys
      : null;
  if (!Array.isArray(list)) throw new Error('certs without keys');
  const keys = new Map<string, CryptoKey>();
  for (const jwk of list) {
    if (typeof jwk !== 'object' || jwk === null) continue;
    const { kid, kty } = jwk as { kid?: unknown; kty?: unknown };
    if (typeof kid !== 'string' || kty !== 'RSA') continue;
    keys.set(
      kid,
      await crypto.subtle.importKey('jwk', jwk as JsonWebKey, RS256, false, [
        'verify',
      ]),
    );
  }
  const set = { keys, fetchedAt: now };
  keyCache.set(teamOrigin, set);
  return set;
};

const signingKey = async (
  teamOrigin: string,
  kid: string,
  now: number,
): Promise<CryptoKey | undefined> => {
  let set = keyCache.get(teamOrigin);
  if (!set || now - set.fetchedAt > ACCESS_KEYS_TTL_MS) {
    set = await fetchKeys(teamOrigin, now);
  } else if (
    !set.keys.has(kid) &&
    now - set.fetchedAt > REFETCH_MIN_INTERVAL_MS
  ) {
    set = await fetchKeys(teamOrigin, now);
  }
  return set.keys.get(kid);
};

const decodePart = (part: string): Uint8Array<ArrayBuffer> => {
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const decodeJson = (part: string): Record<string, unknown> | null => {
  try {
    const value: unknown = JSON.parse(
      new TextDecoder().decode(decodePart(part)),
    );
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

// Allowed clock difference for `nbf`, in seconds.
const CLOCK_SKEW_S = 60;

/**
 * Verifies a Cloudflare Access token (`Cf-Access-Jwt-Assertion`): an RS256
 * signature by a key from the team's `/cdn-cgi/access/certs`, the issuer
 * (the team origin), an audience in `config.audiences`, and `exp` (and
 * `nbf` when present). Keys are cached per isolate for
 * {@link ACCESS_KEYS_TTL_MS}.
 *
 * @param token - The header value, or `null` when the header is missing.
 * @param now - Current time in milliseconds (for tests).
 */
export const verifyAccessJwt = async (
  config: { audiences: readonly string[]; teamOrigin: string },
  token: string | null,
  now: number = Date.now(),
): Promise<AccessJwtResult> => {
  const denied = (detail: string): AccessJwtResult => ({
    ok: false,
    reason: 'denied',
    detail,
  });
  if (!token) return denied('missing token');
  const parts = token.split('.');
  if (parts.length !== 3) return denied('malformed token');
  const [headerPart = '', payloadPart = '', signaturePart = ''] = parts;
  const header = decodeJson(headerPart);
  const payload = decodeJson(payloadPart);
  if (!header || !payload) return denied('malformed token');
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') {
    return denied('unsupported algorithm');
  }
  let key: CryptoKey | undefined;
  try {
    key = await signingKey(config.teamOrigin, header.kid, now);
  } catch (error) {
    return {
      ok: false,
      reason: 'unavailable',
      detail: error instanceof Error ? error.message : 'certs fetch failed',
    };
  }
  if (!key) return denied('unknown key');
  let signature: Uint8Array<ArrayBuffer>;
  try {
    signature = decodePart(signaturePart);
  } catch {
    return denied('malformed signature');
  }
  const valid = await crypto.subtle.verify(
    RS256,
    key,
    signature,
    new TextEncoder().encode(`${headerPart}.${payloadPart}`),
  );
  if (!valid) return denied('bad signature');
  if (payload.iss !== config.teamOrigin) return denied('wrong issuer');
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (
    !audiences.some(
      (aud) => typeof aud === 'string' && config.audiences.includes(aud),
    )
  ) {
    return denied('wrong audience');
  }
  const nowS = now / 1000;
  if (typeof payload.exp !== 'number' || payload.exp <= nowS) {
    return denied('expired');
  }
  if (typeof payload.nbf === 'number' && payload.nbf > nowS + CLOCK_SKEW_S) {
    return denied('not yet valid');
  }
  return { ok: true };
};

/** Forgets cached signing keys. For tests. */
export const clearAccessKeyCache = (): void => {
  keyCache.clear();
  failedAt.clear();
};
