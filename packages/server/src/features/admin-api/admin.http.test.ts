import { beforeEach, describe, expect, test } from 'bun:test';
import {
  passkeySignIn,
  runSetup,
  signInAsAdmin,
} from '../../testing/admin-session.ts';
import {
  CookieJar,
  SoftAuthenticator,
} from '../../testing/soft-authenticator.ts';
import { captureConsole } from '../../testing/console-capture.ts';
import {
  createTestWorker,
  ORIGIN,
  type TestWorker,
} from '../../testing/test-worker.ts';
import { testSubmission } from '../../testing/submissions.ts';
import {
  EXPORT_BATCH_SIZE,
  getSubmission,
  insertSubmission,
  updateSubmission,
} from '../submissions/submission-store.ts';
import type { SubmissionStatus } from '../submissions/submission-status.ts';
import { SUBMISSION_UPDATE_MAX_BODY_BYTES } from './admin-routes.ts';

const DAY = 24 * 60 * 60 * 1000;

const seed = async (
  worker: TestWorker,
  id: string,
  {
    status = 'unread',
    suspectedSpam = false,
    createdAt = Date.now(),
    name = 'Taro',
    body = 'Hello',
    email,
  }: {
    status?: SubmissionStatus;
    suspectedSpam?: boolean;
    email?: string;
    createdAt?: number;
    name?: string;
    body?: string;
  } = {},
) =>
  insertSubmission(
    worker.env.DB,
    testSubmission(id, {
      status,
      suspectedSpam,
      createdAt,
      ...(email ? { email } : {}),
      fields: { f_name: name, f_category: 'sales', f_message: body },
    }),
  );

const ENDPOINTS: [string, string][] = [
  ['GET', '/api/admin/me'],
  ['GET', '/api/admin/status'],
  ['GET', '/api/admin/submissions'],
  ['GET', '/api/admin/submissions/abc'],
  ['PATCH', '/api/admin/submissions/abc'],
  ['DELETE', '/api/admin/submissions/abc'],
  ['POST', '/api/admin/submissions/abc/read'],
  ['GET', '/api/admin/submissions.csv'],
  ['GET', '/api/admin/form'],
  ['PUT', '/api/admin/form'],
  ['GET', '/api/admin/form/versions/1'],
  ['POST', '/api/admin/form/versions/1/restore'],
];

const requestBody = (method: string) =>
  method === 'PATCH'
    ? JSON.stringify({ status: 'read' })
    : method === 'PUT'
      ? JSON.stringify({ baseVersion: 1, fields: [] })
      : method === 'POST'
        ? JSON.stringify({ baseVersion: 1 })
        : undefined;

describe('admin API without a valid admin session', () => {
  test.each(ENDPOINTS)(
    '%s %s returns 401 without a session',
    async (method, path) => {
      const worker = createTestWorker();
      await seed(worker, 'abc');
      const response = await worker.fetch(path, {
        method,
        headers: { origin: ORIGIN, 'content-type': 'application/json' },
        body: requestBody(method),
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

  test.each(ENDPOINTS)(
    '%s %s returns 403 on the next request after the address is removed from ADMIN_EMAILS',
    async (method, path) => {
      const worker = createTestWorker();
      await seed(worker, 'abc');
      const cookie = await signInAsAdmin(worker);
      const call = () =>
        worker.fetch(path, {
          method,
          headers: {
            cookie,
            origin: ORIGIN,
            'content-type': 'application/json',
          },
          body: requestBody(method),
        });
      expect(
        (await worker.fetch('/api/admin/me', { headers: { cookie } })).status,
      ).toBe(200);
      worker.env.ADMIN_EMAILS = 'second@example.com';
      const response = await call();
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe('forbidden');
      expect(
        worker.sqlite
          .query("SELECT status FROM submissions WHERE id = 'abc'")
          .get(),
      ).toEqual({ status: 'unread' });
      expect(
        worker.sqlite.query('SELECT COUNT(*) AS n FROM form_definitions').get(),
      ).toEqual({ n: 1 });
    },
  );

  test('a removed admin loses every session, also after the address is added back', async () => {
    const worker = createTestWorker();
    const cookie = await signInAsAdmin(worker);
    const userId = (
      worker.sqlite.query('SELECT id FROM user').get() as { id: string }
    ).id;
    const other = await passkeySignIn(worker, userId);
    const sessions = () =>
      worker.sqlite.query('SELECT COUNT(*) AS n FROM session').get();
    // The setup session is still there too.
    expect(sessions()).toEqual({ n: 3 });
    worker.env.ADMIN_EMAILS = 'second@example.com';
    const response = await worker.fetch('/api/admin/me', {
      headers: { cookie },
    });
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('forbidden');
    expect(sessions()).toEqual({ n: 0 });
    worker.env.ADMIN_EMAILS = 'admin@example.com';
    for (const old of [cookie, other]) {
      const again = await worker.fetch('/api/admin/me', {
        headers: { cookie: old },
      });
      expect(again.status).toBe(401);
    }
  });

  test('a failed session cleanup does not change the 403', async () => {
    const worker = createTestWorker();
    const cookie = await signInAsAdmin(worker);
    worker.env.ADMIN_EMAILS = 'second@example.com';
    const pause = worker.pauseAt(/^delete from "session"/i);
    void pause.reached.then(() => pause.release(new Error('D1 down')));
    const logs = captureConsole();
    let response: Response;
    let logged: string;
    try {
      response = await worker.fetch('/api/admin/me', { headers: { cookie } });
      logged = logs.text();
    } finally {
      logs.restore();
    }
    expect(response.status).toBe(403);
    expect(logged).toContain('session cleanup failed');
  });

  test('admin API reads do not extend the session', async () => {
    const worker = createTestWorker();
    const cookie = await signInAsAdmin(worker);
    // Make the session old enough that Better Auth would refresh it.
    const soon = Date.now() + 60 * 60 * 1000;
    worker.sqlite.exec(`UPDATE session SET expires_at = ${soon}`);
    expect(
      (await worker.fetch('/api/admin/me', { headers: { cookie } })).status,
    ).toBe(200);
    // Every session keeps its expiry, including the one the cookie belongs to
    // (`signInAsAdmin` leaves a setup session next to it).
    const rows = worker.sqlite
      .query('SELECT expires_at AS e FROM session')
      .all();
    expect(rows.length).toBeGreaterThan(1);
    expect(rows).toEqual(rows.map(() => ({ e: soon })));
  });

  test('a removed address gets no admin access from a new passkey sign-in', async () => {
    const worker = createTestWorker();
    const jar = new CookieJar(await runSetup(worker));
    const authenticator = new SoftAuthenticator();
    await authenticator.register(worker, jar, { createSession: true });
    worker.env.ADMIN_EMAILS = 'second@example.com';
    const signedIn = new CookieJar();
    expect((await authenticator.signIn(worker, signedIn)).status).toBe(200);
    const response = await worker.fetch('/api/admin/me', {
      headers: { cookie: signedIn.header() },
    });
    expect(response.status).toBe(403);
    // The documented clean-up (docs security page) deletes the user's
    // sessions, passkeys, and accounts, then the user, so adding the address
    // back later does not revive them.
    const email = "(SELECT id FROM user WHERE email = 'admin@example.com')";
    worker.sqlite.exec(`DELETE FROM session WHERE user_id IN ${email}`);
    worker.sqlite.exec(`DELETE FROM passkey WHERE user_id IN ${email}`);
    worker.sqlite.exec(`DELETE FROM account WHERE user_id IN ${email}`);
    worker.sqlite.exec("DELETE FROM user WHERE email = 'admin@example.com'");
    expect(
      worker.sqlite.query('SELECT COUNT(*) AS n FROM session').get(),
    ).toEqual({ n: 0 });
    expect(
      worker.sqlite.query('SELECT COUNT(*) AS n FROM passkey').get(),
    ).toEqual({ n: 0 });
    worker.env.ADMIN_EMAILS = 'admin@example.com';
    expect(
      (
        await worker.fetch('/api/admin/me', {
          headers: { cookie: signedIn.header() },
        })
      ).status,
    ).toBe(401);
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
        status: i % 5 === 0 ? 'read' : 'unread',
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
    const read = await (await get('/api/admin/submissions?view=read')).json();
    expect(read.total).toBe(11);
    expect(read.unreadCount).toBe(44);
    const asc = await (await get('/api/admin/submissions?dir=asc')).json();
    expect(asc.items[0].id).toBe('id-54');
    expect((await get('/api/admin/submissions?view=bogus')).status).toBe(400);
    expect((await get('/api/admin/submissions?page=0')).status).toBe(400);
  });

  test('limit sets the page size within 1 to 100', async () => {
    for (let i = 0; i < 12; i++) await seed(worker, `id-${i}`);
    const page = await (
      await get('/api/admin/submissions?limit=5&page=3')
    ).json();
    expect(page).toMatchObject({ page: 3, pageSize: 5, total: 12 });
    expect(page.items).toHaveLength(2);
    const max = await get('/api/admin/submissions?limit=100');
    expect(max.status).toBe(200);
  });

  // Each value must be rejected at the route before it reaches a query.
  const MALICIOUS_QUERIES: [string, string][] = [
    ['view', "unread' OR 1=1 --"],
    ['view', 'unread; DROP TABLE submissions'],
    ['view', 'UNREAD'],
    ['view', 'held'],
    ['status', 'unread'],
    ['q', 'a'.repeat(255)],
    ['limit', '1; DROP TABLE submissions'],
    ['limit', '-1'],
    ['limit', '0'],
    ['limit', '101'],
    ['limit', '1e9'],
    ['limit', '1e1'],
    ['limit', '50 OFFSET 0'],
    ['limit', '50 '],
    ['limit', '10.5'],
    ['limit', '10.0'],
    ['limit', '0x10'],
    ['limit', '010'],
    ['limit', '+5'],
    ['limit', 'NaN'],
    ['limit', 'Infinity'],
    ['limit', ''],
    ['page', "1' OR '1'='1"],
    ['page', '1; DROP TABLE submissions'],
    ['page', '-1'],
    ['page', '0'],
    ['page', '1e9'],
    ['page', '100001'],
    ['page', '9007199254740993'],
    ['page', '2 OFFSET 0'],
    ['page', '1.5'],
    ['page', ' 1'],
    ['page', 'abc'],
    ['page', ''],
    ['version', "1' OR '1'='1"],
    ['version', '0'],
    ['version', '1.5'],
    ['sort', 'received_at'],
    ['sort', 'email'],
    ['sort', 'f_name'],
    ['sort', 'created_at; DROP TABLE submissions'],
    ['dir', 'sideways'],
    ['field', 'f_category'],
    ['value', 'sales'],
    ['search', 'Taro'],
    ['keyword', 'Taro'],
  ];

  test.each(MALICIOUS_QUERIES)(
    'GET /submissions?%s=%p returns 400',
    async (key, value) => {
      await seed(worker, 'abc');
      const query = new URLSearchParams({ [key]: value });
      const response = await get(`/api/admin/submissions?${query}`);
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe('invalid_input');
      const rows = worker.sqlite
        .query('SELECT COUNT(*) AS n FROM submissions')
        .get() as { n: number };
      expect(rows.n).toBe(1);
    },
  );

  test('GET /submissions.csv rejects a malicious view with 400', async () => {
    const query = new URLSearchParams({ view: "unread' OR 1=1 --" });
    const response = await get(`/api/admin/submissions.csv?${query}`);
    expect(response.status).toBe(400);
  });

  test('the detail view changes nothing', async () => {
    await seed(worker, 'abc');
    const detail = await (await get('/api/admin/submissions/abc')).json();
    expect(detail).toMatchObject({ id: 'abc', status: 'unread', readAt: null });
    expect(await getSubmission(worker.env.DB, 'abc')).toMatchObject({
      status: 'unread',
      readAt: null,
    });
    const list = await (await get('/api/admin/submissions')).json();
    expect(list.unreadCount).toBe(1);
  });

  test('POST /submissions/:id/read marks an unread submission as read', async () => {
    await seed(worker, 'abc');
    const detail = await (
      await send('POST', '/api/admin/submissions/abc/read')
    ).json();
    expect(detail).toMatchObject({
      id: 'abc',
      status: 'read',
      formVersion: 1,
      currentFormVersion: 1,
    });
    expect(
      detail.entries.find((entry: { id: string }) => entry.id === 'f_message'),
    ).toEqual({
      id: 'f_message',
      type: 'textarea',
      label: { ja: 'お問い合わせ内容', en: 'Message' },
      value: { kind: 'text', text: 'Hello' },
      inCurrentForm: true,
    });
    expect(detail.readAt).toBeNumber();
    expect(detail).not.toHaveProperty('ipHash');
    expect(detail).not.toHaveProperty('fields');
    const list = await (await get('/api/admin/submissions')).json();
    expect(list.unreadCount).toBe(0);
    expect(
      (await send('POST', '/api/admin/submissions/missing/read')).status,
    ).toBe(404);
    expect((await get('/api/admin/submissions/missing')).status).toBe(404);
  });

  test('POST /submissions/:id/read needs the site origin', async () => {
    await seed(worker, 'abc');
    const response = await send(
      'POST',
      '/api/admin/submissions/abc/read',
      undefined,
      'https://evil.example',
    );
    expect(response.status).toBe(403);
    expect(await getSubmission(worker.env.DB, 'abc')).toMatchObject({
      status: 'unread',
    });
  });

  test('marking read returns the stored state', async () => {
    await seed(worker, 'abc');
    const detail = await (
      await send('POST', '/api/admin/submissions/abc/read')
    ).json();
    const stored = await getSubmission(worker.env.DB, 'abc');
    expect(stored).toMatchObject({ status: 'read' });
    expect(detail).toMatchObject({
      status: stored?.status,
      readAt: stored?.readAt,
      suspectedSpam: stored?.suspectedSpam,
    });
  });

  test('marking read keeps the read time of a read submission', async () => {
    await seed(worker, 'abc');
    await updateSubmission(worker.env.DB, 'abc', { status: 'read' }, 1234);
    const detail = await (
      await send('POST', '/api/admin/submissions/abc/read')
    ).json();
    expect(detail).toMatchObject({ status: 'read', readAt: 1234 });
    expect(await getSubmission(worker.env.DB, 'abc')).toMatchObject({
      status: 'read',
      readAt: 1234,
    });
  });

  test('sets the status back to unread and to read', async () => {
    await seed(worker, 'abc', { status: 'read' });
    const unread = await send('PATCH', '/api/admin/submissions/abc', {
      status: 'unread',
    });
    expect(unread.status).toBe(200);
    expect(await unread.json()).toMatchObject({
      status: 'unread',
      readAt: null,
    });
    expect((await (await get('/api/admin/status')).json()).unreadCount).toBe(1);
    const read = await send('PATCH', '/api/admin/submissions/abc', {
      status: 'read',
    });
    expect((await read.json()).status).toBe('read');
    for (const body of [
      { status: 'done' },
      { status: 'held' },
      { status: 'spam' },
      { status: 'new' },
      {},
      { suspectedSpam: 'yes' },
      { status: 'read', extra: 1 },
      [],
      null,
    ]) {
      const invalid = await send('PATCH', '/api/admin/submissions/abc', body);
      expect(invalid.status).toBe(400);
    }
    const missing = await send('PATCH', '/api/admin/submissions/nope', {
      status: 'read',
    });
    expect(missing.status).toBe(404);
  });

  test('PATCH rejects a body over the cap and a non-JSON type', async () => {
    await seed(worker, 'abc');
    const big = await worker.fetch('/api/admin/submissions/abc', {
      method: 'PATCH',
      headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({
        status: 'read',
        pad: 'x'.repeat(SUBMISSION_UPDATE_MAX_BODY_BYTES),
      }),
    });
    expect(big.status).toBe(413);
    expect((await big.json()).error.code).toBe('payload_too_large');
    const text = await worker.fetch('/api/admin/submissions/abc', {
      method: 'PATCH',
      headers: { cookie, origin: ORIGIN, 'content-type': 'text/plain' },
      body: JSON.stringify({ status: 'read' }),
    });
    expect(text.status).toBe(415);
    expect((await getSubmission(worker.env.DB, 'abc'))?.status).toBe('unread');
  });

  test('sets and clears the suspected spam flag', async () => {
    await seed(worker, 'abc');
    const marked = await send('PATCH', '/api/admin/submissions/abc', {
      suspectedSpam: true,
    });
    expect(marked.status).toBe(200);
    expect(await marked.json()).toMatchObject({
      status: 'unread',
      suspectedSpam: true,
    });
    const status = await (await get('/api/admin/status')).json();
    expect(status.unreadCount).toBe(0);
    const spam = await (await get('/api/admin/submissions?view=spam')).json();
    expect(spam.items.map((s: { id: string }) => s.id)).toEqual(['abc']);
    expect(spam.suspectedSpamCount).toBe(1);
    const cleared = await send('PATCH', '/api/admin/submissions/abc', {
      suspectedSpam: false,
    });
    expect((await cleared.json()).suspectedSpam).toBe(false);
    const unread = await (
      await get('/api/admin/submissions?view=unread')
    ).json();
    expect(unread.items.map((s: { id: string }) => s.id)).toEqual(['abc']);
  });

  test('keeps suspected spam out of every view but its own', async () => {
    await seed(worker, 'unread');
    await seed(worker, 'read', { status: 'read' });
    await seed(worker, 'spam-unread', { suspectedSpam: true });
    await seed(worker, 'spam-read', { status: 'read', suspectedSpam: true });
    const ids = async (query: string) => {
      const list = await (await get(`/api/admin/submissions${query}`)).json();
      expect(list).toMatchObject({ unreadCount: 1, suspectedSpamCount: 2 });
      return list.items.map((s: { id: string }) => s.id).sort();
    };
    expect(await ids('')).toEqual(['read', 'unread']);
    expect(await ids('?view=all')).toEqual(['read', 'unread']);
    expect(await ids('?view=unread')).toEqual(['unread']);
    expect(await ids('?view=read')).toEqual(['read']);
    expect(await ids('?view=spam')).toEqual(['spam-read', 'spam-unread']);
    const list = await (await get('/api/admin/submissions?view=spam')).json();
    expect(list.items[0]).toHaveProperty('suspectedSpam', true);
  });

  test('searches part of the email address only, ignoring case', async () => {
    await seed(worker, 'a', { email: 'Hanako.Sato@Example.JP', name: 'Taro' });
    await seed(worker, 'b', { email: 'taro@example.org' });
    await seed(worker, 'c', { email: 'a_b@example.org' });
    await seed(worker, 'd', { email: 'spam@example.org', suspectedSpam: true });
    const ids = async (q: string, view = 'all') => {
      const query = new URLSearchParams({ q, view });
      const list = await (await get(`/api/admin/submissions?${query}`)).json();
      return list.items.map((s: { id: string }) => s.id).sort();
    };
    expect(await ids('sato@example')).toEqual(['a']);
    expect(await ids('TARO')).toEqual(['b']);
    expect(await ids('  example.org  ')).toEqual(['b', 'c']);
    expect(await ids('_')).toEqual(['c']);
    expect(await ids('%')).toEqual([]);
    expect(await ids('spam')).toEqual([]);
    expect(await ids('spam', 'spam')).toEqual(['d']);
    expect(await ids('')).toEqual(['a', 'b', 'c']);
    const longest = new URLSearchParams({ q: 'a'.repeat(254) });
    expect((await get(`/api/admin/submissions?${longest}`)).status).toBe(200);
    const csv = await (
      await get('/api/admin/submissions.csv?q=TARO&lang=en')
    ).text();
    const lines = csv.split('\r\n').filter((line) => line !== '');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('taro@example.org');
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
      { status: 'read' },
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
    expect(text.split('\r\n')[0]).toBe(
      '"id","received_at","status","suspected_spam","email","locale","form_version","page_path","country","spam_score","spam_reasons","Name","Company or organization","Phone","Category","Message"',
    );
    expect(text).toContain(
      '"\'=HYPERLINK(""https://evil.example"",""click"")"',
    );
    expect(text).toContain('"\'+1 line\n""quoted"""');
    expect(text).not.toContain('"hash"');
  });

  test('streams a CSV export larger than one batch', async () => {
    const total = EXPORT_BATCH_SIZE * 2 + 5;
    for (let i = 0; i < total; i++) {
      await seed(worker, `id${String(i).padStart(4, '0')}`, {
        createdAt: 1_700_000_000_000 + Math.floor(i / 3),
        body: i === 0 ? ' =cmd|"/c calc"!A1' : 'Hello',
      });
    }
    const response = await get('/api/admin/submissions.csv');
    expect(response.status).toBe(200);
    expect(response.body).toBeInstanceOf(ReadableStream);
    const text = await response.text();
    const lines = text.split('\r\n').filter((line) => line !== '');
    expect(lines).toHaveLength(total + 1);
    const ids = lines.slice(1).map((line) => line.slice(1, 7));
    expect(new Set(ids).size).toBe(total);
    expect(ids[0]).toBe(`id${String(total - 1).padStart(4, '0')}`);
    expect(text).toContain(`"' =cmd|""/c calc""!A1"`);
  });

  test('a failed CSV stream ends with a generic error, not the query', async () => {
    await seed(worker, 'abc');
    const pause = worker.pauseAt(/^select .* from "submissions"/s);
    const logs = captureConsole();
    try {
      const response = await get('/api/admin/submissions.csv?q=secret-search');
      expect(response.status).toBe(200);
      const reading = response.text().then(
        () => null,
        (error: unknown) => error,
      );
      await pause.reached;
      pause.release(new Error('D1 failed: params secret-search'));
      const failure = await reading;
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toBe('csv export failed');
      expect(logs.text()).toContain('csv export failed');
    } finally {
      logs.restore();
    }
  });

  test('GET /status reports configuration without secret values', async () => {
    await seed(worker, 'abc');
    const status = await (await get('/api/admin/status')).json();
    expect(status).toMatchObject({
      turnstileConfigured: true,
      contactAvailable: true,
      contactMissing: [],
      contactTooShort: [],
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

  test('GET /status reports an IP_HASH_SECRET that is too short', async () => {
    worker.env.IP_HASH_SECRET = 'short-secret';
    const status = await (await get('/api/admin/status')).json();
    expect(status).toMatchObject({
      contactAvailable: false,
      contactMissing: ['IP_HASH_SECRET'],
      contactTooShort: ['IP_HASH_SECRET'],
    });
    expect(JSON.stringify(status)).not.toContain('short-secret');
  });

  test('GET /status reports a weak IP_HASH_SECRET', async () => {
    worker.env.IP_HASH_SECRET = '0123456789'.repeat(4);
    const status = await (await get('/api/admin/status')).json();
    expect(status).toMatchObject({
      contactAvailable: false,
      contactMissing: ['IP_HASH_SECRET'],
      contactTooShort: ['IP_HASH_SECRET'],
    });
    expect(JSON.stringify(status)).not.toContain('0123456789');
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

  test('GET /status lists no categories', async () => {
    expect(await (await get('/api/admin/status')).json()).not.toHaveProperty(
      'categories',
    );
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

describe('admin API database errors', () => {
  const request = async (
    worker: TestWorker,
    cookie: string,
    method: string,
    path: string,
  ) => {
    const logs = captureConsole();
    try {
      const response = await worker.fetch(path, {
        method,
        headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
        body: requestBody(method),
      });
      return { response, logged: logs.text() };
    } finally {
      logs.restore();
    }
  };

  test('a failed query answers 500 and logs no bound values', async () => {
    const worker = createTestWorker();
    const cookie = await signInAsAdmin(worker);
    await seed(worker, 'sub-7f3a9c', { name: 'Hanako' });
    worker.sqlite.exec('DROP TABLE submissions');
    const { response, logged } = await request(
      worker,
      cookie,
      'PATCH',
      '/api/admin/submissions/sub-7f3a9c',
    );
    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe('server_error');
    expect(logged).toContain('no such table');
    expect(logged).not.toContain('sub-7f3a9c');
    expect(logged).not.toContain('params');
  });

  test('a failed session lookup logs no session token', async () => {
    const worker = createTestWorker();
    const cookie = await signInAsAdmin(worker);
    const { token } = worker.sqlite
      .query('SELECT token FROM session')
      .get() as {
      token: string;
    };
    worker.sqlite.exec('DROP TABLE session');
    const { response, logged } = await request(
      worker,
      cookie,
      'GET',
      '/api/admin/me',
    );
    expect(response.status).toBe(500);
    expect(logged).toContain('no such table');
    expect(logged).not.toContain(token);
    expect(logged).not.toContain('params');
  });
});
