import { describe, expect, test } from 'bun:test';
import { signInAsAdmin } from '../../testing/admin-session.ts';
import {
  CLIENT_IP,
  createTestWorker,
  dumpDatabase,
  ORIGIN,
  SECRETS,
  type TestWorker,
} from '../../testing/test-worker.ts';

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
    });
    const unconfigured = createTestWorker({ env: { SETUP_TOKEN: undefined } });
    expect(await (await unconfigured.fetch('/api/setup')).json()).toEqual({
      configured: false,
      open: false,
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
    const ips = worker.sqlite.query('SELECT ipAddress FROM session').all();
    expect(ips).toEqual([{ ipAddress: '' }]);
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
    });
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
  });

  test.each([
    ['SETUP_TOKEN', 'setup_unavailable'],
    ['ADMIN_EMAILS', 'setup_unavailable'],
    ['BETTER_AUTH_SECRET', 'auth_unavailable'],
  ])('fails closed with 503 without %s', async (name, code) => {
    const worker = createTestWorker({ env: { [name]: undefined } });
    const response = await setup(worker, {
      token: SECRETS.SETUP_TOKEN,
      email: 'admin@example.com',
    });
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe(code);
    expect(userCount(worker)).toBe(0);
  });
});
