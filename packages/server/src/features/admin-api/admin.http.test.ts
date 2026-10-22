import { beforeEach, describe, expect, test } from 'bun:test';
import { signInAsAdmin } from '../../testing/admin-session.ts';
import {
  createTestWorker,
  ORIGIN,
  type TestWorker,
} from '../../testing/test-worker.ts';
import { insertSubmission } from '../submissions/submission-store.ts';
import type { SubmissionStatus } from '../submissions/submission-status.ts';

const DAY = 24 * 60 * 60 * 1000;

const seed = async (
  worker: TestWorker,
  id: string,
  {
    status = 'new',
    createdAt = Date.now(),
    name = 'Taro',
    body = 'Hello',
  }: {
    status?: SubmissionStatus;
    createdAt?: number;
    name?: string;
    body?: string;
  } = {},
) =>
  insertSubmission(worker.env.DB, {
    id,
    createdAt,
    name,
    email: `${id}@example.org`,
    company: null,
    phone: null,
    category: 'sales',
    body,
    status,
    spamScore: 0,
    spamReasons: [],
    ipHash: 'hash',
    userAgent: null,
    country: 'JP',
    pagePath: '/contact',
    consentAt: createdAt,
  });

const ENDPOINTS: [string, string][] = [
  ['GET', '/api/admin/me'],
  ['GET', '/api/admin/status'],
  ['GET', '/api/admin/submissions'],
  ['GET', '/api/admin/submissions/abc'],
  ['PATCH', '/api/admin/submissions/abc'],
  ['DELETE', '/api/admin/submissions/abc'],
  ['GET', '/api/admin/submissions.csv'],
];

describe('admin API without a valid admin session', () => {
  test.each(ENDPOINTS)(
    '%s %s returns 401 without a session',
    async (method, path) => {
      const worker = createTestWorker();
      await seed(worker, 'abc');
      const response = await worker.fetch(path, {
        method,
        headers: { origin: ORIGIN, 'content-type': 'application/json' },
        body:
          method === 'PATCH' ? JSON.stringify({ status: 'done' }) : undefined,
      });
      expect(response.status).toBe(401);
      expect((await response.json()).error.code).toBe('unauthorized');
    },
  );

  test('a forged session cookie returns 401', async () => {
    const worker = createTestWorker();
    const response = await worker.fetch('/api/admin/submissions', {
      headers: { cookie: 'better-auth.session_token=forged.value' },
    });
    expect(response.status).toBe(401);
  });

  test('the setup session without a passkey returns 403', async () => {
    const worker = createTestWorker();
    const cookie = await signInAsAdmin(worker, { passkey: false });
    const response = await worker.fetch('/api/admin/submissions', {
      headers: { cookie },
    });
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('passkey_required');
  });

  test('an admin removed from ADMIN_EMAILS returns 403', async () => {
    const worker = createTestWorker();
    const cookie = await signInAsAdmin(worker);
    worker.env.ADMIN_EMAILS = 'someone-else@example.com';
    const response = await worker.fetch('/api/admin/submissions', {
      headers: { cookie },
    });
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('forbidden');
  });

  test('fails closed with 503 without BETTER_AUTH_SECRET', async () => {
    const worker = createTestWorker({ env: { BETTER_AUTH_SECRET: undefined } });
    const response = await worker.fetch('/api/admin/submissions');
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('auth_unavailable');
    const auth = await worker.fetch('/api/auth/get-session');
    expect(auth.status).toBe(503);
  });
});

describe('admin API with an admin session', () => {
  let worker: TestWorker;
  let cookie: string;
  beforeEach(async () => {
    worker = createTestWorker();
    cookie = await signInAsAdmin(worker);
  });
  const get = (path: string) => worker.fetch(path, { headers: { cookie } });
  const send = (
    method: string,
    path: string,
    body?: unknown,
    origin = ORIGIN,
  ) =>
    worker.fetch(path, {
      method,
      headers: { cookie, origin, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  test('GET /me returns the admin', async () => {
    expect(await (await get('/api/admin/me')).json()).toMatchObject({
      email: 'admin@example.com',
      name: 'Admin',
    });
  });

  test('lists 50 per page, newest first, with the unread count', async () => {
    const now = Date.now();
    for (let i = 0; i < 55; i++) {
      await seed(worker, `id-${String(i).padStart(2, '0')}`, {
        createdAt: now - i * 1000,
        status: i % 5 === 0 ? 'done' : 'new',
      });
    }
    const first = await (await get('/api/admin/submissions')).json();
    expect(first.items).toHaveLength(50);
    expect(first.items[0].id).toBe('id-00');
    expect(first).toMatchObject({
      page: 1,
      pageSize: 50,
      total: 55,
      unreadCount: 44,
    });
    expect(first.items[0]).not.toHaveProperty('ipHash');
    const second = await (await get('/api/admin/submissions?page=2')).json();
    expect(second.items.map((s: { id: string }) => s.id)).toEqual([
      'id-50',
      'id-51',
      'id-52',
      'id-53',
      'id-54',
    ]);
    const done = await (await get('/api/admin/submissions?status=done')).json();
    expect(done.total).toBe(11);
    expect(done.unreadCount).toBe(44);
    expect((await get('/api/admin/submissions?status=bogus')).status).toBe(400);
    expect((await get('/api/admin/submissions?page=0')).status).toBe(400);
  });

  test('the detail view marks a new submission as read', async () => {
    await seed(worker, 'abc');
    const detail = await (await get('/api/admin/submissions/abc')).json();
    expect(detail).toMatchObject({ id: 'abc', status: 'read', body: 'Hello' });
    expect(detail.readAt).toBeNumber();
    expect(detail).not.toHaveProperty('ipHash');
    const list = await (await get('/api/admin/submissions')).json();
    expect(list.unreadCount).toBe(0);
    expect((await get('/api/admin/submissions/missing')).status).toBe(404);
  });

  test('changes the status', async () => {
    await seed(worker, 'abc');
    const response = await send('PATCH', '/api/admin/submissions/abc', {
      status: 'spam',
    });
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe('spam');
    const invalid = await send('PATCH', '/api/admin/submissions/abc', {
      status: 'archived',
    });
    expect(invalid.status).toBe(400);
    const missing = await send('PATCH', '/api/admin/submissions/nope', {
      status: 'done',
    });
    expect(missing.status).toBe(404);
  });

  test('deletes a submission', async () => {
    await seed(worker, 'abc');
    expect((await send('DELETE', '/api/admin/submissions/abc')).status).toBe(
      200,
    );
    expect((await get('/api/admin/submissions/abc')).status).toBe(404);
    expect((await send('DELETE', '/api/admin/submissions/abc')).status).toBe(
      404,
    );
  });

  test('state-changing requests from another origin return 403', async () => {
    await seed(worker, 'abc');
    const patch = await send(
      'PATCH',
      '/api/admin/submissions/abc',
      { status: 'done' },
      'https://evil.example',
    );
    expect(patch.status).toBe(403);
    const del = await send(
      'DELETE',
      '/api/admin/submissions/abc',
      undefined,
      'https://evil.example',
    );
    expect(del.status).toBe(403);
    expect((await get('/api/admin/submissions/abc')).status).toBe(200);
  });

  test('exports CSV with formula injection escaped', async () => {
    await seed(worker, 'abc', {
      name: '=HYPERLINK("https://evil.example","click")',
      body: '+1 line\n"quoted"',
    });
    const response = await get('/api/admin/submissions.csv');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(
      'text/csv; charset=utf-8',
    );
    expect(response.headers.get('content-disposition')).toMatch(
      /^attachment; filename="inquiries-\d{8}\.csv"$/,
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(bytes);
    expect(text.startsWith('"id","created_at"')).toBe(true);
    expect(text).toContain(
      '"\'=HYPERLINK(""https://evil.example"",""click"")"',
    );
    expect(text).toContain('"\'+1 line\n""quoted"""');
    expect(text).not.toContain('"hash"');
  });

  test('GET /status reports configuration without secret values', async () => {
    await seed(worker, 'abc');
    const status = await (await get('/api/admin/status')).json();
    expect(status).toMatchObject({
      turnstileConfigured: true,
      contactAvailable: true,
      contactMissing: [],
      slackConfigured: false,
      retentionDays: 180,
      unreadCount: 1,
    });
    expect(status.version).toBeString();
    const text = JSON.stringify(status);
    for (const value of Object.values(worker.env)) {
      if (typeof value === 'string') expect(text).not.toContain(value);
    }
  });

  test('GET /status reports a missing Turnstile setup', async () => {
    worker.env.TURNSTILE_SECRET = undefined;
    worker.env.TURNSTILE_SITE_KEY = undefined;
    const status = await (await get('/api/admin/status')).json();
    expect(status).toMatchObject({
      turnstileConfigured: false,
      contactAvailable: false,
      contactMissing: ['TURNSTILE_SECRET', 'TURNSTILE_SITE_KEY'],
    });
  });

  test('listing prunes rows past the retention period', async () => {
    await seed(worker, 'old', { createdAt: Date.now() - 181 * DAY });
    await seed(worker, 'recent', { createdAt: Date.now() - 179 * DAY });
    const list = await (await get('/api/admin/submissions')).json();
    expect(list.items.map((s: { id: string }) => s.id)).toContain('recent');
    expect((await get('/api/admin/submissions/old')).status).toBe(404);
    expect((await get('/api/admin/submissions/recent')).status).toBe(200);
  });
});
