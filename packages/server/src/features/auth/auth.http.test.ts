import { describe, expect, test } from 'bun:test';
import { hmacSha256Hex } from '../../shared/crypto.ts';
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

const OPTIONS_PATH = '/api/auth/passkey/generate-authenticate-options';

const verificationCount = (worker: TestWorker) =>
  (
    worker.sqlite.query('SELECT COUNT(*) AS n FROM verification').get() as {
      n: number;
    }
  ).n;

describe('/api/auth passkey sign-in', () => {
  test('is rate-limited per ip_hash before Better Auth writes a challenge', async () => {
    const worker = createTestWorker({ rateLimit: 3 });
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      statuses.push((await worker.fetch(OPTIONS_PATH)).status);
    }
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
    expect(verificationCount(worker)).toBe(3);
    const ipHash = await hmacSha256Hex(SECRETS.IP_HASH_SECRET, CLIENT_IP);
    expect(worker.rateLimitKeys).toEqual(Array(5).fill(`auth:${ipHash}`));
    expect(dumpDatabase(worker.sqlite)).not.toContain(CLIENT_IP);
  });

  test('counts verify-authentication and slash variants on the same key', async () => {
    const worker = createTestWorker({ rateLimit: 2 });
    const verify = await worker.fetch(
      '/api/auth/passkey/verify-authentication',
      {
        method: 'POST',
        headers: { origin: ORIGIN, 'content-type': 'application/json' },
        body: JSON.stringify({ response: {} }),
      },
    );
    expect(verify.status).not.toBe(429);
    expect((await worker.fetch(`${OPTIONS_PATH}/`)).status).not.toBe(429);
    expect(
      (await worker.fetch('/api/auth//passkey/generate-authenticate-options'))
        .status,
    ).toBe(429);
    expect(worker.rateLimitKeys).toHaveLength(3);
  });

  test('does not count session reads', async () => {
    const worker = createTestWorker({ rateLimit: 1 });
    for (let i = 0; i < 3; i++) {
      expect((await worker.fetch('/api/auth/get-session')).status).toBe(200);
    }
    expect(worker.rateLimitKeys).toEqual([]);
  });

  test.each(['IP_HASH_SECRET', 'CONTACT_RATE_LIMITER'])(
    'fails closed with 503 without %s',
    async (name) => {
      const worker = createTestWorker({ env: { [name]: undefined } });
      const response = await worker.fetch(OPTIONS_PATH);
      expect(response.status).toBe(503);
      expect((await response.json()).error.code).toBe('auth_unavailable');
      expect(verificationCount(worker)).toBe(0);
    },
  );
});

describe('/api/auth database errors', () => {
  const failingRequest = async (
    worker: TestWorker,
    path: string,
    cookie: string,
  ) => {
    const logs = captureConsole();
    try {
      const response = await worker.fetch(path, { headers: { cookie } });
      return { response, logged: logs.text() };
    } finally {
      logs.restore();
    }
  };

  test('passkey registration logs no address, user ID, or bound values', async () => {
    const worker = createTestWorker();
    const cookie = await signInAsAdmin(worker, { passkey: false });
    const { id } = worker.sqlite.query('SELECT id FROM user').get() as {
      id: string;
    };
    worker.sqlite.exec('DROP TABLE verification');
    const { response, logged } = await failingRequest(
      worker,
      '/api/auth/passkey/generate-register-options',
      cookie,
    );
    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe('server_error');
    expect(logged).toContain('no such table');
    expect(logged).not.toContain('admin@example.com');
    expect(logged).not.toContain(id);
    expect(logged).not.toContain('params');
    expect(logged).not.toContain('SERVER_ERROR');
  });

  test('a session lookup logs no session token or user ID', async () => {
    const worker = createTestWorker();
    const cookie = await signInAsAdmin(worker, { passkey: false });
    const { token, user_id: userId } = worker.sqlite
      .query('SELECT token, user_id FROM session')
      .get() as { token: string; user_id: string };
    worker.sqlite.exec('DROP TABLE user');
    const { response, logged } = await failingRequest(
      worker,
      '/api/auth/get-session',
      cookie,
    );
    expect(response.status).toBe(500);
    expect(logged).toContain('no such table');
    expect(logged).not.toContain(token);
    expect(logged).not.toContain(userId);
    expect(logged).not.toContain('admin@example.com');
    expect(logged).not.toContain('params');
  });
});
