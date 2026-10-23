import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { runSetup } from '../testing/admin-session.ts';
import { captureConsole } from '../testing/console-capture.ts';
import { mockExternalFetch } from '../testing/external-fetch.ts';
import { CookieJar, SoftAuthenticator } from '../testing/soft-authenticator.ts';
import {
  APP_SECRET,
  CLIENT_IP,
  createTestWorker,
  dumpDatabase,
  ORIGIN,
  SECRETS,
  type TestSecrets,
  type TestWorker,
} from '../testing/test-worker.ts';
import {
  APP_SECRET_LABELS,
  deriveAppSecretKey,
  resolveAppSecret,
} from './app-secret.ts';
import { hmacSha256Hex } from './crypto.ts';
import { MIN_SECRET_LENGTH } from './secret-length.ts';

const OTHER_APP_SECRET = 'other-app-secret-0123456789abcdefghijklm';

const json = { origin: ORIGIN, 'content-type': 'application/json' };

const contactBody = {
  email: 'visitor@example.org',
  fields: { f_name: 'Visitor', f_category: 'sales', f_message: 'Hello.' },
  consent: true,
  formVersion: 1,
  locale: 'en',
  turnstileToken: 'token-123',
  elapsedMs: 20_000,
  pagePath: '/contact',
};

const submitContact = (worker: TestWorker) =>
  worker.fetch('/api/contact', {
    method: 'POST',
    headers: json,
    body: JSON.stringify(contactBody),
  });

const setup = (worker: TestWorker, token: string) =>
  worker.fetch('/api/setup', {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ token, email: 'admin@example.com', name: 'Admin' }),
  });

const me = (worker: TestWorker, cookie: string) =>
  worker.fetch('/api/admin/me', { headers: { cookie } });

const setupState = async (worker: TestWorker) =>
  (await worker.fetch('/api/setup')).json();

const errorOf = async (response: Response) =>
  ((await response.json()) as { error: { code: string; message: string } })
    .error;

const ipHashes = (worker: TestWorker) =>
  (
    worker.sqlite.query('SELECT ip_hash FROM submissions').all() as {
      ip_hash: string;
    }[]
  ).map((row) => row.ip_hash);

const count = (worker: TestWorker, sql: string) =>
  (worker.sqlite.query(sql).get() as { n: number }).n;

const derived = async (appSecret = APP_SECRET) => ({
  auth: await deriveAppSecretKey(
    appSecret,
    APP_SECRET_LABELS.BETTER_AUTH_SECRET,
  ),
  ip: await deriveAppSecretKey(appSecret, APP_SECRET_LABELS.IP_HASH_SECRET),
});

// Registers the first passkey with a software authenticator after setup and
// returns the authenticator and the session cookie of the registration.
const registerFirstPasskey = async (worker: TestWorker) => {
  const jar = new CookieJar(await runSetup(worker));
  const authenticator = new SoftAuthenticator();
  const registered = await authenticator.register(worker, jar, {
    createSession: true,
  });
  expect(registered.status).toBe(200);
  return { authenticator, cookie: jar.header() };
};

let external: ReturnType<typeof mockExternalFetch>;
beforeEach(() => {
  external = mockExternalFetch();
});
afterEach(() => external.restore());

describe.each<[TestSecrets, string]>([
  ['app-secret', 'APP_SECRET and ADMIN_EMAILS only'],
  ['legacy', 'the four variables'],
])('with %s secrets (%s)', (secrets) => {
  const ipKey = async () =>
    secrets === 'legacy' ? SECRETS.IP_HASH_SECRET : (await derived()).ip;

  test('setup, first passkey, sign-out, passkey sign-in, contact', async () => {
    const worker = createTestWorker({ secrets });
    expect(await setupState(worker)).toEqual({
      configured: true,
      open: true,
      tokenName: secrets === 'legacy' ? 'SETUP_TOKEN' : 'APP_SECRET',
      problems: [],
    });

    const { authenticator, cookie } = await registerFirstPasskey(worker);
    expect(count(worker, 'SELECT COUNT(*) AS n FROM passkey')).toBe(1);
    expect(
      count(
        worker,
        "SELECT COUNT(*) AS n FROM settings WHERE key = 'setup_closed_at'",
      ),
    ).toBe(1);
    expect((await setupState(worker)).open).toBe(false);
    expect((await setup(worker, worker.setupToken)).status).toBe(403);
    expect((await me(worker, cookie)).status).toBe(200);

    const signOut = await worker.fetch('/api/auth/sign-out', {
      method: 'POST',
      headers: { ...json, cookie },
      body: '{}',
    });
    expect(signOut.status).toBe(200);
    expect((await me(worker, cookie)).status).toBe(401);

    const signedIn = new CookieJar();
    expect((await authenticator.signIn(worker, signedIn)).status).toBe(200);
    expect((await me(worker, signedIn.header())).status).toBe(200);

    const status = await (
      await worker.fetch('/api/admin/status', {
        headers: { cookie: signedIn.header() },
      })
    ).json();
    expect(status).toMatchObject({
      contactAvailable: true,
      contactMissing: [],
      contactTooShort: [],
    });

    expect((await submitContact(worker)).status).toBe(200);
    const expected = await hmacSha256Hex(await ipKey(), CLIENT_IP);
    expect(ipHashes(worker)).toEqual([expected]);
    expect(worker.rateLimitKeys).toContain(expected);
    expect(worker.rateLimitKeys).toContain(`setup:${expected}`);
    expect(worker.rateLimitKeys).toContain(`auth:${expected}`);
  });

  test('passkey recovery reopens setup with the same secret', async () => {
    const worker = createTestWorker({ secrets });
    const { cookie } = await registerFirstPasskey(worker);
    // The manual D1 change from the passkey recovery guide.
    worker.sqlite.exec(
      "DELETE FROM session; DELETE FROM passkey; DELETE FROM settings WHERE key = 'setup_closed_at';",
    );
    expect((await setupState(worker)).open).toBe(true);
    const again = await registerFirstPasskey(worker);
    expect((await setupState(worker)).open).toBe(false);
    expect((await me(worker, cookie)).status).toBe(401);
    expect((await me(worker, again.cookie)).status).toBe(200);
  });

  test('stores and returns no secret value', async () => {
    const worker = createTestWorker({
      secrets,
      env: { SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/T/B/X' },
    });
    const logs = captureConsole();
    let logText = '';
    const bodies: string[] = [];
    try {
      console.warn('log-capture-sentinel');
      bodies.push(await (await worker.fetch('/api/setup')).text());
      bodies.push(await (await setup(worker, 'wrong-token')).text());
      const { cookie } = await registerFirstPasskey(worker);
      for (const path of ['/api/admin/status', '/api/admin/me']) {
        bodies.push(
          await (await worker.fetch(path, { headers: { cookie } })).text(),
        );
      }
      bodies.push(await (await submitContact(worker)).text());
      bodies.push(await (await worker.fetch('/api/contact/form')).text());
    } finally {
      logText = logs.text();
      logs.restore();
    }
    expect(logText).toContain('log-capture-sentinel');
    const resolved = await resolveAppSecret(worker.env);
    const secretValues = [
      APP_SECRET,
      SECRETS.SETUP_TOKEN,
      SECRETS.BETTER_AUTH_SECRET,
      SECRETS.IP_HASH_SECRET,
      ...Object.values(await derived()),
      resolved.BETTER_AUTH_SECRET ?? '',
      resolved.IP_HASH_SECRET ?? '',
    ];
    const outputs = [dumpDatabase(worker.sqlite), logText, ...bodies];
    for (const output of outputs) {
      for (const value of secretValues) expect(output).not.toContain(value);
    }
  });
});

describe('APP_SECRET alone', () => {
  test('is the setup token, and a wrong token is still refused', async () => {
    const worker = createTestWorker({ secrets: 'app-secret' });
    const wrong = await setup(worker, OTHER_APP_SECRET);
    expect(wrong.status).toBe(403);
    expect((await errorOf(wrong)).code).toBe('invalid_setup_token');
    expect((await setup(worker, APP_SECRET)).status).toBe(200);
  });

  test('signs sessions with the derived key, not with APP_SECRET', async () => {
    const worker = createTestWorker({ secrets: 'app-secret' });
    const resolved = await resolveAppSecret(worker.env);
    expect(resolved.BETTER_AUTH_SECRET).toBe((await derived()).auth);
    const { cookie } = await registerFirstPasskey(worker);
    expect((await me(worker, cookie)).status).toBe(200);
  });

  test('a new APP_SECRET signs every admin out and changes IP hashes', async () => {
    const worker = createTestWorker({ secrets: 'app-secret' });
    const { cookie } = await registerFirstPasskey(worker);
    expect((await submitContact(worker)).status).toBe(200);
    worker.env.APP_SECRET = OTHER_APP_SECRET;
    expect((await me(worker, cookie)).status).toBe(401);
    expect((await submitContact(worker)).status).toBe(200);
    expect(ipHashes(worker)).toEqual([
      await hmacSha256Hex((await derived()).ip, CLIENT_IP),
      await hmacSha256Hex((await derived(OTHER_APP_SECRET)).ip, CLIENT_IP),
    ]);
  });

  test('setting or removing BETTER_AUTH_SECRET replaces the signing key', async () => {
    const worker = createTestWorker({ secrets: 'app-secret' });
    const { cookie } = await registerFirstPasskey(worker);
    expect((await me(worker, cookie)).status).toBe(200);
    worker.env.BETTER_AUTH_SECRET = SECRETS.BETTER_AUTH_SECRET;
    expect((await me(worker, cookie)).status).toBe(401);
    worker.env.BETTER_AUTH_SECRET = undefined;
    expect((await me(worker, cookie)).status).toBe(200);
  });

  test('removing APP_SECRET turns sign-in and the contact API off', async () => {
    const worker = createTestWorker({ secrets: 'app-secret' });
    const { cookie } = await registerFirstPasskey(worker);
    worker.env.APP_SECRET = undefined;
    const admin = await me(worker, cookie);
    expect(admin.status).toBe(503);
    expect((await errorOf(admin)).code).toBe('auth_unavailable');
    expect((await submitContact(worker)).status).toBe(503);
  });

  test.each([
    ['missing', undefined],
    ['too_short', APP_SECRET.slice(0, MIN_SECRET_LENGTH - 1)],
  ])('fails closed when APP_SECRET is %s', async (issue, value) => {
    const worker = createTestWorker({
      secrets: 'app-secret',
      env: { APP_SECRET: value },
    });
    expect(await setupState(worker)).toEqual({
      configured: false,
      open: false,
      tokenName: 'APP_SECRET',
      problems: [{ name: 'APP_SECRET', issue }],
    });
    for (const token of [value ?? 'x', APP_SECRET]) {
      const response = await setup(worker, token);
      expect(response.status).toBe(503);
      const error = await errorOf(response);
      expect(error.code).toBe('auth_unavailable');
      expect(error.message).toContain('APP_SECRET');
    }
    for (const path of [
      '/api/auth/get-session',
      '/api/auth/passkey/generate-authenticate-options',
      '/api/admin/me',
      '/api/admin/status',
    ]) {
      const response = await worker.fetch(path);
      expect(response.status).toBe(503);
      expect((await errorOf(response)).code).toBe('auth_unavailable');
    }
    const contact = await submitContact(worker);
    expect(contact.status).toBe(503);
    expect((await errorOf(contact)).code).toBe('contact_unavailable');
    const form = await (await worker.fetch('/api/contact/form')).json();
    expect(form.available).toBe(false);
    expect(count(worker, 'SELECT COUNT(*) AS n FROM user')).toBe(0);
    expect(count(worker, 'SELECT COUNT(*) AS n FROM submissions')).toBe(0);
    expect(worker.rateLimitKeys).toEqual([]);
    expect(external.turnstileCalls()).toEqual([]);
  });

  test('accepts an APP_SECRET of exactly 32 characters', async () => {
    const appSecret = APP_SECRET.slice(0, MIN_SECRET_LENGTH);
    const worker = createTestWorker({
      secrets: 'app-secret',
      env: { APP_SECRET: appSecret },
    });
    expect((await setupState(worker)).configured).toBe(true);
    expect((await setup(worker, appSecret)).status).toBe(200);
    expect((await submitContact(worker)).status).toBe(200);
  });

  test('names the setting the contact API needs in the admin status', async () => {
    // Sign-in keeps working on BETTER_AUTH_SECRET while the IP hash key
    // comes and goes with APP_SECRET.
    const worker = createTestWorker({
      secrets: 'app-secret',
      env: { BETTER_AUTH_SECRET: SECRETS.BETTER_AUTH_SECRET },
    });
    const { cookie } = await registerFirstPasskey(worker);
    const status = async () =>
      (await (
        await worker.fetch('/api/admin/status', { headers: { cookie } })
      ).json()) as Record<string, unknown>;

    worker.env.APP_SECRET = APP_SECRET.slice(0, MIN_SECRET_LENGTH - 1);
    expect(await status()).toMatchObject({
      contactAvailable: false,
      contactMissing: ['APP_SECRET'],
      contactTooShort: ['APP_SECRET'],
    });
    worker.env.APP_SECRET = undefined;
    expect(await status()).toMatchObject({
      contactAvailable: false,
      contactMissing: ['APP_SECRET'],
      contactTooShort: [],
    });
    worker.env.APP_SECRET = APP_SECRET;
    worker.env.IP_HASH_SECRET = 'short-secret';
    expect(await status()).toMatchObject({
      contactAvailable: false,
      contactMissing: ['IP_HASH_SECRET'],
      contactTooShort: ['IP_HASH_SECRET'],
    });
    worker.env.IP_HASH_SECRET = '';
    expect(await status()).toMatchObject({
      contactAvailable: true,
      contactMissing: [],
      contactTooShort: [],
    });
  });
});

describe('APP_SECRET with variables set by hand', () => {
  test('SETUP_TOKEN, when set, is the only accepted token', async () => {
    const worker = createTestWorker({
      secrets: 'app-secret',
      env: { SETUP_TOKEN: SECRETS.SETUP_TOKEN },
    });
    expect((await setupState(worker)).tokenName).toBe('SETUP_TOKEN');
    const refused = await setup(worker, APP_SECRET);
    expect(refused.status).toBe(403);
    expect((await errorOf(refused)).code).toBe('invalid_setup_token');
    expect((await setup(worker, SECRETS.SETUP_TOKEN)).status).toBe(200);
  });

  test('recovery can set SETUP_TOKEN again, and APP_SECRET works after it is removed', async () => {
    const worker = createTestWorker({ secrets: 'app-secret' });
    await registerFirstPasskey(worker);
    worker.sqlite.exec(
      "DELETE FROM session; DELETE FROM passkey; DELETE FROM settings WHERE key = 'setup_closed_at';",
    );
    worker.env.SETUP_TOKEN = SECRETS.SETUP_TOKEN;
    expect((await setup(worker, APP_SECRET)).status).toBe(403);
    expect((await setup(worker, SECRETS.SETUP_TOKEN)).status).toBe(200);
    worker.env.SETUP_TOKEN = undefined;
    expect((await setup(worker, APP_SECRET)).status).toBe(200);
  });

  test('adding APP_SECRET to a four-variable site keeps its keys', async () => {
    const worker = createTestWorker({ env: { APP_SECRET } });
    const resolved = await resolveAppSecret(worker.env);
    expect(resolved.SETUP_TOKEN).toBe(SECRETS.SETUP_TOKEN);
    expect(resolved.BETTER_AUTH_SECRET).toBe(SECRETS.BETTER_AUTH_SECRET);
    expect(resolved.IP_HASH_SECRET).toBe(SECRETS.IP_HASH_SECRET);
    const { cookie } = await registerFirstPasskey(worker);
    expect((await me(worker, cookie)).status).toBe(200);
    expect((await submitContact(worker)).status).toBe(200);
    expect(ipHashes(worker)).toEqual([
      await hmacSha256Hex(SECRETS.IP_HASH_SECRET, CLIENT_IP),
    ]);
  });

  test('a too short BETTER_AUTH_SECRET is not replaced by APP_SECRET', async () => {
    const worker = createTestWorker({
      secrets: 'app-secret',
      env: { BETTER_AUTH_SECRET: 'short-secret' },
    });
    expect(await setupState(worker)).toMatchObject({
      configured: false,
      problems: [{ name: 'BETTER_AUTH_SECRET', issue: 'too_short' }],
    });
    const response = await setup(worker, APP_SECRET);
    expect(response.status).toBe(503);
    expect((await errorOf(response)).code).toBe('auth_unavailable');
  });
});
