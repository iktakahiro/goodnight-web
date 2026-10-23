import { describe, expect, test } from 'bun:test';
import { hmacSha256Hex } from '../../shared/crypto.ts';
import { MIN_SECRET_LENGTH } from '../../shared/secret-length.ts';
import { signInAsAdmin } from '../../testing/admin-session.ts';
import { captureConsole } from '../../testing/console-capture.ts';
import {
  CLIENT_IP,
  createTestWorker,
  dumpDatabase,
  ORIGIN,
  SECRETS,
  type TestWorker,
} from '../../testing/test-worker.ts';
import { getAuth } from '../auth/auth.ts';

const setup = (
  worker: TestWorker,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) =>
  worker.fetch('/api/setup', {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const userCount = (worker: TestWorker) =>
  (worker.sqlite.query('SELECT COUNT(*) AS n FROM user').get() as { n: number })
    .n;

describe('/api/setup', () => {
  test('reports whether setup is configured and open', async () => {
    const worker = createTestWorker();
    expect(await (await worker.fetch('/api/setup')).json()).toEqual({
      configured: true,
      open: true,
      problems: [],
    });
    const unconfigured = createTestWorker({ env: { SETUP_TOKEN: undefined } });
    expect(await (await unconfigured.fetch('/api/setup')).json()).toEqual({
      configured: false,
      open: false,
      problems: [{ name: 'SETUP_TOKEN', issue: 'missing' }],
    });
  });

  test('creates the first admin and a working session', async () => {
    const worker = createTestWorker();
    const response = await setup(worker, {
      token: SECRETS.SETUP_TOKEN,
      email: 'Admin@Example.com',
      name: 'Admin',
    });
    expect(response.status).toBe(200);
    const cookie = response.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
    expect(cookie).toContain('session_token');
    const session = await worker.fetch('/api/auth/get-session', {
      headers: { cookie },
    });
    expect((await session.json()).user.email).toBe('admin@example.com');
  });

  test('stores no raw IP in the session', async () => {
    const worker = createTestWorker();
    await signInAsAdmin(worker, { passkey: false });
    const ips = worker.sqlite.query('SELECT ip_address FROM session').all();
    expect(ips).toEqual([{ ip_address: '' }]);
    expect(dumpDatabase(worker.sqlite)).not.toContain(CLIENT_IP);
  });

  test('rejects a wrong token with 403', async () => {
    const worker = createTestWorker();
    const response = await setup(worker, {
      token: 'wrong-token',
      email: 'admin@example.com',
    });
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('invalid_setup_token');
    expect(userCount(worker)).toBe(0);
  });

  test('rejects an address that is not in ADMIN_EMAILS with 403', async () => {
    const worker = createTestWorker();
    const response = await setup(worker, {
      token: SECRETS.SETUP_TOKEN,
      email: 'intruder@example.com',
    });
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('email_not_allowed');
    expect(userCount(worker)).toBe(0);
  });

  test('closes once a passkey exists', async () => {
    const worker = createTestWorker();
    await signInAsAdmin(worker);
    const response = await setup(worker, {
      token: SECRETS.SETUP_TOKEN,
      email: 'second@example.com',
    });
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('setup_closed');
    expect(userCount(worker)).toBe(1);
    expect(await (await worker.fetch('/api/setup')).json()).toEqual({
      configured: true,
      open: false,
      problems: [],
    });
  });

  test('logs no address or token when the database write fails', async () => {
    const worker = createTestWorker();
    worker.sqlite.exec('DROP TABLE session');
    const logs = captureConsole();
    try {
      const response = await setup(worker, {
        token: SECRETS.SETUP_TOKEN,
        email: 'admin@example.com',
        name: 'Admin',
      });
      expect(response.status).toBe(500);
      const logged = logs.text();
      expect(logged).toContain('no such table');
      expect(logged).not.toContain('admin@example.com');
      expect(logged).not.toContain(SECRETS.SETUP_TOKEN);
      expect(logged).not.toContain('params');
    } finally {
      logs.restore();
    }
  });

  test('stays closed after every passkey is deleted', async () => {
    const worker = createTestWorker();
    await signInAsAdmin(worker);
    worker.sqlite.exec('DELETE FROM passkey');
    expect(await (await worker.fetch('/api/setup')).json()).toEqual({
      configured: true,
      open: false,
      problems: [],
    });
    const response = await setup(worker, {
      token: SECRETS.SETUP_TOKEN,
      email: 'second@example.com',
    });
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('setup_closed');
    expect(userCount(worker)).toBe(1);
  });

  test('the server-only setup endpoint also refuses once setup closed', async () => {
    const worker = createTestWorker();
    await signInAsAdmin(worker);
    worker.sqlite.exec('DELETE FROM passkey');
    const auth = getAuth(worker.env, ORIGIN);
    await expect(
      auth.api.createFirstAdmin({
        body: { email: 'second@example.com', name: 'Second' },
        headers: new Headers({ origin: ORIGIN }),
      }),
    ).rejects.toThrow('setup closed');
    expect(userCount(worker)).toBe(1);
  });

  test('can run again while no passkey is registered', async () => {
    const worker = createTestWorker();
    await signInAsAdmin(worker, { passkey: false });
    await signInAsAdmin(worker, { passkey: false });
    expect(userCount(worker)).toBe(1);
  });

  test('the Better Auth endpoint behind setup is not reachable directly', async () => {
    const worker = createTestWorker();
    const response = await worker.fetch(
      '/api/auth/goodnight-setup/create-first-admin',
      {
        method: 'POST',
        headers: { origin: ORIGIN, 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'admin@example.com', name: 'x' }),
      },
    );
    expect(response.status).toBe(404);
    expect(userCount(worker)).toBe(0);
  });

  test('rejects a foreign Origin', async () => {
    const worker = createTestWorker();
    const response = await setup(
      worker,
      { token: SECRETS.SETUP_TOKEN, email: 'admin@example.com' },
      { origin: 'https://evil.example' },
    );
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('forbidden_origin');
  });

  test('is rate-limited per ip_hash', async () => {
    const worker = createTestWorker({ rateLimit: 2 });
    const body = { token: 'wrong', email: 'admin@example.com' };
    expect((await setup(worker, body)).status).toBe(403);
    expect((await setup(worker, body)).status).toBe(403);
    expect((await setup(worker, body)).status).toBe(429);
    const ipHash = await hmacSha256Hex(SECRETS.IP_HASH_SECRET, CLIENT_IP);
    expect(worker.rateLimitKeys).toEqual(Array(3).fill(`setup:${ipHash}`));
  });

  test.each([
    ['SETUP_TOKEN', 'setup_unavailable'],
    ['ADMIN_EMAILS', 'setup_unavailable'],
    ['IP_HASH_SECRET', 'setup_unavailable'],
    ['CONTACT_RATE_LIMITER', 'setup_unavailable'],
    ['BETTER_AUTH_SECRET', 'auth_unavailable'],
  ])('fails closed with 503 without %s', async (name, code) => {
    const worker = createTestWorker({ env: { [name]: undefined } });
    expect(await (await worker.fetch('/api/setup')).json()).toEqual({
      configured: false,
      open: false,
      problems: [{ name, issue: 'missing' }],
    });
    const response = await setup(worker, {
      token: SECRETS.SETUP_TOKEN,
      email: 'admin@example.com',
    });
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe(code);
    expect(userCount(worker)).toBe(0);
    expect(worker.rateLimitKeys).toEqual([]);
  });

  test.each([
    ['SETUP_TOKEN', 'setup_unavailable'],
    ['IP_HASH_SECRET', 'setup_unavailable'],
    ['BETTER_AUTH_SECRET', 'auth_unavailable'],
  ])(
    'fails closed with 503 when %s is shorter than 32 characters',
    async (name, code) => {
      const short = 'x'.repeat(MIN_SECRET_LENGTH - 1);
      const worker = createTestWorker({ env: { [name]: short } });
      expect(await (await worker.fetch('/api/setup')).json()).toEqual({
        configured: false,
        open: false,
        problems: [{ name, issue: 'too_short' }],
      });
      const response = await setup(worker, {
        token: name === 'SETUP_TOKEN' ? short : SECRETS.SETUP_TOKEN,
        email: 'admin@example.com',
      });
      expect(response.status).toBe(503);
      expect((await response.json()).error.code).toBe(code);
      expect(userCount(worker)).toBe(0);
    },
  );

  test.each([
    ['one repeated character', 'x'.repeat(40)],
    ['too few distinct characters', 'abcdefghi'.repeat(4)],
    ['a repeated block', '0123456789'.repeat(4)],
    ['a repeated longer block', 'Kq3!zT9#mW1@pL5$'.repeat(2)],
  ])('fails closed with 503 when a secret is weak: %s', async (_case, weak) => {
    for (const [name, code] of [
      ['SETUP_TOKEN', 'setup_unavailable'],
      ['IP_HASH_SECRET', 'setup_unavailable'],
      ['BETTER_AUTH_SECRET', 'auth_unavailable'],
    ] as const) {
      const worker = createTestWorker({ env: { [name]: weak } });
      const state = await (await worker.fetch('/api/setup')).json();
      expect(state).toEqual({
        configured: false,
        open: false,
        problems: [{ name, issue: 'weak' }],
      });
      // The value itself is never returned.
      expect(JSON.stringify(state)).not.toContain(weak);
      const response = await setup(worker, {
        token: name === 'SETUP_TOKEN' ? weak : SECRETS.SETUP_TOKEN,
        email: 'admin@example.com',
      });
      expect(response.status).toBe(503);
      expect((await response.json()).error.code).toBe(code);
    }
  });

  test('accepts random secrets of exactly 32 characters', async () => {
    const token = 'n4Vq8ZrT1xKp0sWb7LmC3yHd6FgJ2eRa';
    expect(token).toHaveLength(MIN_SECRET_LENGTH);
    const worker = createTestWorker({
      env: {
        SETUP_TOKEN: token,
        IP_HASH_SECRET: 'Qm7Xc2Lr9VbN4tKs8WpZ1hGd5JfY3aEu',
      },
    });
    const response = await setup(worker, {
      token,
      email: 'admin@example.com',
    });
    expect(response.status).toBe(200);
  });

  test('lists no problems once setup is closed', async () => {
    const worker = createTestWorker();
    await signInAsAdmin(worker);
    worker.env.SETUP_TOKEN = undefined;
    expect(await (await worker.fetch('/api/setup')).json()).toEqual({
      configured: false,
      open: false,
      problems: [],
    });
  });
});
