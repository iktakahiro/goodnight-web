import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { signInAsAdmin } from '../../testing/admin-session.ts';
import { createTestWorker, ORIGIN } from '../../testing/test-worker.ts';
import { getAuth } from './auth.ts';

// Better Auth reads `NODE_ENV` and `TEST` from `process.env`, which Workers
// fill from the Worker's vars and secrets. `bun test` sets NODE_ENV=test, so
// these tests run in exactly the mode that used to turn the checks off.
describe('Better Auth origin check with test-mode variables', () => {
  let previousTest: string | undefined;
  beforeEach(() => {
    previousTest = process.env.TEST;
    process.env.TEST = '1';
  });
  afterEach(() => {
    if (previousTest === undefined) delete process.env.TEST;
    else process.env.TEST = previousTest;
  });

  test('runs in test mode', () => {
    expect(process.env.NODE_ENV).toBe('test');
    expect(process.env.TEST).toBe('1');
  });

  test('keeps the origin and CSRF checks on', async () => {
    const worker = createTestWorker({ env: { TEST: '1', NODE_ENV: 'test' } });
    const context = await getAuth(worker.env, ORIGIN).$context;
    expect(context.skipOriginCheck).toBe(false);
    expect(context.skipCSRFCheck).toBe(false);
  });

  test.each([
    ['another origin', { origin: 'https://evil.example' }],
    ['a null origin', { origin: 'null' }],
    ['no origin', {}],
  ])(
    'rejects a cookie-bearing POST from %s',
    async (_name, originHeader: Record<string, string>) => {
      const worker = createTestWorker({ env: { TEST: '1', NODE_ENV: 'test' } });
      const cookie = await signInAsAdmin(worker);
      const response = await worker.fetch('/api/auth/sign-out', {
        method: 'POST',
        headers: {
          ...originHeader,
          cookie,
          'content-type': 'application/json',
        },
        body: '{}',
      });
      expect(response.status).toBe(403);
      const me = await worker.fetch('/api/admin/me', { headers: { cookie } });
      expect(me.status).toBe(200);
    },
  );

  test('accepts the same POST from the site itself', async () => {
    const worker = createTestWorker({ env: { TEST: '1', NODE_ENV: 'test' } });
    const cookie = await signInAsAdmin(worker);
    const response = await worker.fetch('/api/auth/sign-out', {
      method: 'POST',
      headers: { origin: ORIGIN, cookie, 'content-type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBe(200);
  });
});

describe('Better Auth variables that goodnight-web does not support', () => {
  test.each(['BETTER_AUTH_TRUSTED_ORIGINS', 'BETTER_AUTH_SECRETS'])(
    'turns sign-in off while %s is set',
    async (name) => {
      const worker = createTestWorker({
        env: { [name]: 'https://evil.example' },
      });
      const response = await worker.fetch(
        '/api/auth/passkey/generate-authenticate-options',
      );
      expect(response.status).toBe(503);
      expect((await response.json()).error.code).toBe('auth_unavailable');
      const admin = await worker.fetch('/api/admin/me');
      expect(admin.status).toBe(503);
      expect(await (await worker.fetch('/api/setup')).json()).toEqual({
        configured: false,
        open: false,
        problems: [{ name, issue: 'unsupported' }],
      });
    },
  );

  test('ignores an empty value', async () => {
    const worker = createTestWorker({
      env: { BETTER_AUTH_TRUSTED_ORIGINS: '' },
    });
    const response = await worker.fetch(
      '/api/auth/passkey/generate-authenticate-options',
    );
    expect(response.status).toBe(200);
  });
});
