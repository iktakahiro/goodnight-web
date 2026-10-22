import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  spyOn,
  test,
} from 'bun:test';
import { captureConsole } from '../../testing/console-capture.ts';
import { createTestWorker } from '../../testing/test-worker.ts';
import {
  ACCESS_KEYS_TTL_MS,
  clearAccessKeyCache,
  readAccessConfig,
  verifyAccessJwt,
} from './access-jwt.ts';

const TEAM = 'goodnight.cloudflareaccess.com';
const TEAM_ORIGIN = `https://${TEAM}`;
const CERTS_URL = `${TEAM_ORIGIN}/cdn-cgi/access/certs`;
const AUD = 'aud-tag-0123456789';
const ACCESS_ENV = { ACCESS_AUD: AUD, ACCESS_TEAM_DOMAIN: TEAM };

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
let fetchSpy: ReturnType<typeof spyOn>;
beforeEach(() => {
  clearAccessKeyCache();
  certsCalls = 0;
  certsStatus = 200;
  fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async (
    input: string | URL | Request,
  ) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url !== CERTS_URL) throw new Error(`unexpected fetch: ${url}`);
    certsCalls++;
    if (certsStatus !== 200) return new Response('no', { status: certsStatus });
    return Response.json({
      keys: [{ ...publicJwk, kid: 'k1', alg: 'RS256', use: 'sig' }],
    });
  }) as typeof fetch);
});
afterEach(() => fetchSpy.mockRestore());

const PROTECTED = [
  '/admin',
  '/%61dmin',
  '/api/admin/me',
  '/api/setup',
  '/api/auth/get-session',
];

describe('readAccessConfig', () => {
  test('is off without settings and invalid with only one', () => {
    const env = createTestWorker().env;
    expect(readAccessConfig(env)).toEqual({ state: 'off' });
    expect(readAccessConfig({ ...env, ACCESS_AUD: AUD })).toEqual({
      state: 'invalid',
    });
    expect(readAccessConfig({ ...env, ACCESS_TEAM_DOMAIN: TEAM })).toEqual({
      state: 'invalid',
    });
    expect(
      readAccessConfig({
        ...env,
        ACCESS_AUD: `${AUD}, other`,
        ACCESS_TEAM_DOMAIN: `https://${TEAM}/`,
      }),
    ).toEqual({
      state: 'on',
      audiences: [AUD, 'other'],
      teamOrigin: TEAM_ORIGIN,
    });
    expect(
      readAccessConfig({ ...env, ...ACCESS_ENV, ACCESS_TEAM_DOMAIN: 'a/b' }),
    ).toEqual({ state: 'invalid' });
  });
});

describe('Cloudflare Access check', () => {
  const quiet = async <T>(run: () => Promise<T>): Promise<T> => {
    const logs = captureConsole();
    try {
      return await run();
    } finally {
      logs.restore();
    }
  };

  test.each(PROTECTED)('%s needs the Access token', async (path) => {
    const worker = createTestWorker({ env: ACCESS_ENV });
    const response = await quiet(() =>
      worker.fetch(`https://example.com${path}`),
    );
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('access_denied');
  });

  test.each(PROTECTED)('%s passes with a valid token', async (path) => {
    const worker = createTestWorker({ env: ACCESS_ENV });
    const response = await worker.fetch(`https://example.com${path}`, {
      headers: { 'cf-access-jwt-assertion': await sign({}) },
    });
    expect(response.status).not.toBe(403);
    expect(response.status).not.toBe(503);
  });

  test('the contact API is not behind Access', async () => {
    const worker = createTestWorker({ env: ACCESS_ENV });
    expect((await worker.fetch('/api/contact/config')).status).toBe(200);
    expect(certsCalls).toBe(0);
  });

  test('is off without the settings', async () => {
    const worker = createTestWorker();
    expect((await worker.fetch('/api/setup')).status).toBe(200);
    expect(certsCalls).toBe(0);
  });

  test('fails closed with 503 when only one setting is set', async () => {
    const worker = createTestWorker({ env: { ACCESS_AUD: AUD } });
    const response = await worker.fetch('/api/setup');
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('access_unavailable');
  });

  test('fails closed with 503 when the keys cannot be fetched', async () => {
    certsStatus = 500;
    const worker = createTestWorker({ env: ACCESS_ENV });
    const response = await quiet(() =>
      worker.fetch('/api/setup', {
        headers: { 'cf-access-jwt-assertion': 'a.b.c' },
      }),
    );
    expect([403, 503]).toContain(response.status);
    const token = await sign({});
    const second = await quiet(() =>
      worker.fetch('/api/setup', {
        headers: { 'cf-access-jwt-assertion': token },
      }),
    );
    expect(second.status).toBe(503);
    expect((await second.json()).error.code).toBe('access_unavailable');
  });

  test('caches the signing keys', async () => {
    const worker = createTestWorker({ env: ACCESS_ENV });
    const token = await sign({});
    for (let i = 0; i < 3; i++) {
      await worker.fetch('/api/setup', {
        headers: { 'cf-access-jwt-assertion': token },
      });
    }
    expect(certsCalls).toBe(1);
  });
});

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

  test('rejects a token whose payload was changed after signing', async () => {
    const [header, , signature] = (await sign({})).split('.');
    const forged = b64url(
      JSON.stringify({ aud: [AUD], iss: TEAM_ORIGIN, exp: nowS() + 600 }),
    );
    expect(
      await verifyAccessJwt(config, `${header}.${forged}.${signature}`),
    ).toMatchObject({ ok: false, detail: 'bad signature' });
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
