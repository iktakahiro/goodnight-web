import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  spyOn,
  test,
} from 'bun:test';
import {
  ACCESS_KEYS_FAILURE_BACKOFF_MS,
  ACCESS_KEYS_TTL_MS,
  clearAccessKeyCache,
  verifyAccessJwt,
} from './access-jwt.ts';

const TEAM = 'goodnight.cloudflareaccess.com';
const TEAM_ORIGIN = `https://${TEAM}`;
const CERTS_URL = `${TEAM_ORIGIN}/cdn-cgi/access/certs`;
const AUD = 'aud-tag-0123456789';

const b64url = (bytes: Uint8Array | string) =>
  btoa(typeof bytes === 'string' ? bytes : String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

let keys: CryptoKeyPair;
let otherKeys: CryptoKeyPair;
let publicJwk: JsonWebKey;
const RSA = {
  name: 'RSASSA-PKCS1-v1_5',
  modulusLength: 2048,
  publicExponent: Uint8Array.of(1, 0, 1),
  hash: 'SHA-256',
};

beforeAll(async () => {
  keys = (await crypto.subtle.generateKey(RSA, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  otherKeys = (await crypto.subtle.generateKey(RSA, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  publicJwk = (await crypto.subtle.exportKey(
    'jwk',
    keys.publicKey,
  )) as JsonWebKey;
});

const sign = async (
  claims: Record<string, unknown>,
  { kid = 'k1', alg = 'RS256', key = keys.privateKey } = {},
) => {
  const nowS = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg, kid, typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      aud: [AUD],
      iss: TEAM_ORIGIN,
      exp: nowS + 600,
      iat: nowS,
      email: 'admin@example.com',
      ...claims,
    }),
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      key,
      new TextEncoder().encode(`${header}.${payload}`),
    ),
  );
  return `${header}.${payload}.${b64url(signature)}`;
};

let certsCalls = 0;
let certsStatus = 200;
let certsBody: unknown;
let fetchSpy: ReturnType<typeof spyOn>;
beforeEach(() => {
  clearAccessKeyCache();
  certsCalls = 0;
  certsStatus = 200;
  certsBody = { keys: [{ ...publicJwk, kid: 'k1', alg: 'RS256', use: 'sig' }] };
  fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async (
    input: string | URL | Request,
  ) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url !== CERTS_URL) throw new Error(`unexpected fetch: ${url}`);
    certsCalls++;
    if (certsStatus !== 200) return new Response('no', { status: certsStatus });
    return Response.json(certsBody);
  }) as typeof fetch);
});
afterEach(() => fetchSpy.mockRestore());

describe('verifyAccessJwt', () => {
  const config = { audiences: [AUD], teamOrigin: TEAM_ORIGIN };
  const nowS = (): number => Math.floor(Date.now() / 1000);

  test('accepts a valid token, with aud as a string too', async () => {
    expect(await verifyAccessJwt(config, await sign({}))).toEqual({ ok: true });
    expect(await verifyAccessJwt(config, await sign({ aud: AUD }))).toEqual({
      ok: true,
    });
  });

  const cases: [string, () => Promise<string | null>][] = [
    ['missing token', async () => null],
    ['malformed token', async () => 'not-a-jwt'],
    ['wrong audience', () => sign({ aud: ['other-app'] })],
    ['wrong audience', () => sign({ aud: [{ toString: null }, 42] })],
    ['wrong issuer', () => sign({ iss: 'https://evil.cloudflareaccess.com' })],
    ['expired', () => sign({ exp: nowS() - 1 })],
    ['expired', () => sign({ exp: undefined })],
    ['not yet valid', () => sign({ nbf: nowS() + 3600 })],
    ['not yet valid', () => sign({ iat: nowS() + 3600 })],
    ['unsupported algorithm', () => sign({}, { alg: 'none' })],
    ['unsupported algorithm', () => sign({}, { alg: 'HS256' })],
    ['unknown key', () => sign({}, { kid: 'other' })],
    ['bad signature', () => sign({}, { key: otherKeys.privateKey })],
  ];
  test.each(cases)('rejects: %s', async (detail, make) => {
    expect(await verifyAccessJwt(config, await make())).toEqual({
      ok: false,
      reason: 'denied',
      detail,
    });
  });

  test.each(['nbf', 'iat'])(
    'allows 60 seconds of clock skew for %s',
    async (claim) => {
      const now = Math.floor(Date.now() / 1000) * 1000;
      expect(
        await verifyAccessJwt(
          config,
          await sign({ [claim]: now / 1000 + 60 }),
          now,
        ),
      ).toEqual({ ok: true });
      expect(
        await verifyAccessJwt(
          config,
          await sign({ [claim]: now / 1000 + 61 }),
          now,
        ),
      ).toMatchObject({ ok: false, reason: 'denied' });
    },
  );

  test('rejects malformed token segments', async () => {
    const [header, payload, signature] = (await sign({})).split('.');
    for (const token of [
      `${header}.${payload}`,
      `${header}.${payload}.${signature}.extra`,
      `!.${payload}.${signature}`,
      `${header}.+.${signature}`,
      `${header}.${payload}.!`,
      `${b64url('{')}.${payload}.${signature}`,
      `${header}.${b64url('{')}.${signature}`,
    ]) {
      expect(await verifyAccessJwt(config, token)).toMatchObject({
        ok: false,
        reason: 'denied',
      });
    }
  });

  test('rejects non-base64url and invalid-length signatures', async () => {
    let token = await sign({});
    for (
      let nonce = 0;
      !/[-_]/.test(token.split('.')[2] ?? '') && nonce < 20;
      nonce++
    ) {
      token = await sign({ nonce });
    }
    const [header, payload, signature = ''] = token.split('.');
    expect(await verifyAccessJwt(config, token)).toEqual({ ok: true });
    expect(signature).toMatch(/[-_]/);
    const standardBase64 = signature.replace(/-/g, '+').replace(/_/g, '/');

    for (const invalidSignature of [`${signature}==`, standardBase64, 'A']) {
      expect(
        await verifyAccessJwt(
          config,
          `${header}.${payload}.${invalidSignature}`,
        ),
      ).toEqual({ ok: false, reason: 'denied', detail: 'malformed signature' });
    }
  });

  test.each([
    null,
    {},
    { keys: 'invalid' },
    { keys: [{ kid: 'k1', kty: 'RSA' }] },
  ])('fails closed for malformed JWKS: %j', async (body) => {
    certsBody = body;
    expect(await verifyAccessJwt(config, await sign({}))).toMatchObject({
      ok: false,
      reason: 'unavailable',
    });
  });

  test('fails closed when the JWKS fetch throws', async () => {
    fetchSpy.mockImplementationOnce(async () => {
      throw new Error('network failure');
    });
    expect(await verifyAccessJwt(config, await sign({}))).toMatchObject({
      ok: false,
      reason: 'unavailable',
    });
  });

  test('limits refetches for unknown keys', async () => {
    const now = Date.now();
    const token = await sign({}, { kid: 'unknown' });
    expect(await verifyAccessJwt(config, token, now)).toMatchObject({
      ok: false,
      reason: 'denied',
    });
    await verifyAccessJwt(config, token, now + 30_000);
    expect(certsCalls).toBe(1);
    await verifyAccessJwt(config, token, now + 30_001);
    expect(certsCalls).toBe(2);
  });

  test('rejects a token whose payload was changed after signing', async () => {
    const [header, , signature] = (await sign({})).split('.');
    const forged = b64url(
      JSON.stringify({ aud: [AUD], iss: TEAM_ORIGIN, exp: nowS() + 600 }),
    );
    expect(
      await verifyAccessJwt(config, `${header}.${forged}.${signature}`),
    ).toMatchObject({ ok: false, detail: 'bad signature' });
  });

  test('backs off after a failed fetch of the keys', async () => {
    certsStatus = 500;
    const token = await sign({});
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      expect(await verifyAccessJwt(config, token, now + i)).toMatchObject({
        ok: false,
        reason: 'unavailable',
      });
    }
    expect(certsCalls).toBe(1);
    certsStatus = 200;
    expect(
      await verifyAccessJwt(
        config,
        token,
        now + ACCESS_KEYS_FAILURE_BACKOFF_MS - 1,
      ),
    ).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(
      await verifyAccessJwt(
        config,
        token,
        now + ACCESS_KEYS_FAILURE_BACKOFF_MS,
      ),
    ).toEqual({ ok: true });
    expect(certsCalls).toBe(2);
  });

  test('refetches the keys after the cache expires', async () => {
    const token = await sign({});
    const now = Date.now();
    await verifyAccessJwt(config, token, now);
    await verifyAccessJwt(config, token, now + 1000);
    expect(certsCalls).toBe(1);
    await verifyAccessJwt(config, token, now + ACCESS_KEYS_TTL_MS + 1);
    expect(certsCalls).toBe(2);
  });
});
