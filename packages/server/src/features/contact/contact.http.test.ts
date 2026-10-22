import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { hmacSha256Hex } from '../../shared/crypto.ts';
import {
  mockExternalFetch,
  TURNSTILE_OK,
} from '../../testing/external-fetch.ts';
import {
  CLIENT_IP,
  createTestWorker,
  dumpDatabase,
  ORIGIN,
  SECRETS,
  type TestWorker,
} from '../../testing/test-worker.ts';

const SLACK_URL = 'https://hooks.slack.com/services/T000/B000/XXXX';

const validBody = (overrides: Record<string, unknown> = {}) => ({
  name: 'Hanako Yamada',
  email: 'hanako@example.org',
  company: 'Yamada Shoten',
  phone: '03-1234-5678',
  category: 'sales',
  message: 'I would like to know more about your services.',
  consent: true,
  turnstileToken: 'token-123',
  elapsedMs: 20_000,
  pagePath: '/contact',
  ...overrides,
});

const post = (
  worker: TestWorker,
  body: unknown,
  init: { headers?: Record<string, string> } = {},
) =>
  worker.fetch('/api/contact', {
    method: 'POST',
    headers: {
      origin: ORIGIN,
      'content-type': 'application/json',
      ...init.headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const rows = (worker: TestWorker) =>
  worker.sqlite.query('SELECT * FROM submissions').all() as Record<
    string,
    unknown
  >[];

let external: ReturnType<typeof mockExternalFetch>;
beforeEach(() => {
  external = mockExternalFetch();
});
afterEach(() => external.restore());

describe('POST /api/contact', () => {
  test('stores a valid submission and returns 200', async () => {
    const worker = createTestWorker({
      options: { contact: { categories: ['sales', 'press'] } },
    });
    const response = await post(worker, validBody());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const [row] = rows(worker);
    expect(row).toMatchObject({
      name: 'Hanako Yamada',
      email: 'hanako@example.org',
      company: 'Yamada Shoten',
      phone: '03-1234-5678',
      category: 'sales',
      body: 'I would like to know more about your services.',
      status: 'new',
      spam_score: 0,
      page_path: '/contact',
    });
    expect(row?.consent_at).toBeNumber();
    const [verify] = external.turnstileCalls();
    expect(verify?.form?.get('secret')).toBe(SECRETS.TURNSTILE_SECRET);
    expect(verify?.form?.get('response')).toBe('token-123');
  });

  test('stores only the HMAC of the IP, never the raw IP', async () => {
    const worker = createTestWorker();
    expect((await post(worker, validBody())).status).toBe(200);
    const expected = await hmacSha256Hex(SECRETS.IP_HASH_SECRET, CLIENT_IP);
    expect(rows(worker)[0]?.ip_hash).toBe(expected);
    expect(dumpDatabase(worker.sqlite)).not.toContain(CLIENT_IP);
    expect(worker.rateLimitKeys).toEqual([expected]);
  });

  test('a filled honeypot is stored as held and answered with success', async () => {
    const worker = createTestWorker();
    const response = await post(
      worker,
      validBody({ website: 'https://spam.example', turnstileToken: undefined }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const [row] = rows(worker);
    expect(row?.status).toBe('held');
    expect(JSON.parse(String(row?.spam_reasons))).toEqual(['honeypot']);
    expect(external.turnstileCalls()).toHaveLength(0);
    expect(external.slackCalls()).toHaveLength(0);
  });

  test('a honeypot flood over the rate limit is not stored', async () => {
    const worker = createTestWorker({ rateLimit: 2 });
    for (let i = 0; i < 4; i++) {
      const response = await post(worker, validBody({ website: 'x' }));
      expect(response.status).toBe(200);
    }
    expect(rows(worker)).toHaveLength(2);
  });

  test('a failed Turnstile check returns 400 and stores nothing', async () => {
    external.restore();
    external = mockExternalFetch({
      turnstile: () => ({
        success: false,
        'error-codes': ['invalid-input-response'],
      }),
    });
    const worker = createTestWorker();
    const response = await post(worker, validBody());
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('turnstile_failed');
    expect(rows(worker)).toHaveLength(0);
  });

  test('a missing Turnstile token returns 400 without calling siteverify', async () => {
    const worker = createTestWorker();
    const response = await post(worker, validBody({ turnstileToken: '' }));
    expect(response.status).toBe(400);
    expect(external.turnstileCalls()).toHaveLength(0);
    expect(rows(worker)).toHaveLength(0);
  });

  test.each([
    ['hostname', { ...TURNSTILE_OK, hostname: 'evil.example' }],
    ['action', { ...TURNSTILE_OK, action: 'login' }],
  ])('a Turnstile %s mismatch returns 400', async (_name, result) => {
    external.restore();
    external = mockExternalFetch({ turnstile: () => result });
    const worker = createTestWorker();
    const response = await post(worker, validBody());
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('turnstile_failed');
    expect(rows(worker)).toHaveLength(0);
  });

  test('turnstileHostnames replaces the request hostname', async () => {
    external.restore();
    external = mockExternalFetch({
      turnstile: () => ({ ...TURNSTILE_OK, hostname: 'www.example.com' }),
    });
    const worker = createTestWorker({
      options: { contact: { turnstileHostnames: ['www.example.com'] } },
    });
    expect((await post(worker, validBody())).status).toBe(200);
  });

  test('returns 429 over the rate limit', async () => {
    const worker = createTestWorker({ rateLimit: 2 });
    expect((await post(worker, validBody())).status).toBe(200);
    expect((await post(worker, validBody())).status).toBe(200);
    const response = await post(worker, validBody());
    expect(response.status).toBe(429);
    expect((await response.json()).error.code).toBe('rate_limited');
    expect(rows(worker)).toHaveLength(2);
  });

  test.each([
    'TURNSTILE_SECRET',
    'TURNSTILE_SITE_KEY',
    'IP_HASH_SECRET',
    'CONTACT_RATE_LIMITER',
  ])('fails closed with 503 without %s', async (name) => {
    const worker = createTestWorker({ env: { [name]: undefined } });
    const response = await post(worker, validBody());
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('contact_unavailable');
    expect(external.calls).toHaveLength(0);
    expect(rows(worker)).toHaveLength(0);
    const config = await (await worker.fetch('/api/contact/config')).json();
    expect(config).toMatchObject({ available: false, turnstileSiteKey: null });
  });

  test('the config endpoint returns the public settings when available', async () => {
    const worker = createTestWorker({
      options: { contact: { categories: ['sales'] } },
    });
    const config = await (await worker.fetch('/api/contact/config')).json();
    expect(config).toEqual({
      available: true,
      turnstileSiteKey: SECRETS.TURNSTILE_SITE_KEY,
      turnstileAction: 'contact',
      honeypotField: 'website',
      categories: ['sales'],
    });
    expect(JSON.stringify(config)).not.toContain(SECRETS.TURNSTILE_SECRET);
  });

  test('rejects a foreign or missing Origin with 403', async () => {
    const worker = createTestWorker();
    const foreign = await post(worker, validBody(), {
      headers: { origin: 'https://evil.example' },
    });
    expect(foreign.status).toBe(403);
    expect((await foreign.json()).error.code).toBe('forbidden_origin');
    const missing = await worker.fetch('/api/contact', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validBody()),
    });
    expect(missing.status).toBe(403);
    expect(external.calls).toHaveLength(0);
  });

  test('rejects another origin of the same site and sends no CORS headers', async () => {
    const worker = createTestWorker();
    const response = await post(worker, validBody(), {
      headers: { origin: 'https://www.example.com' },
    });
    expect(response.status).toBe(403);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(rows(worker)).toEqual([]);
  });

  test('rejects a body over 16 KB with 413 before parsing', async () => {
    const worker = createTestWorker();
    const big = JSON.stringify(validBody({ message: 'a'.repeat(17_000) }));
    const response = await post(worker, big);
    expect(response.status).toBe(413);
    expect(external.calls).toHaveLength(0);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(big));
        controller.close();
      },
    });
    const chunked = await worker.fetch('/api/contact', {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-type': 'application/json' },
      body: stream,
    });
    expect(chunked.status).toBe(413);
    expect(rows(worker)).toHaveLength(0);
  });

  test('rejects a non-JSON content type with 415 and bad JSON with 400', async () => {
    const worker = createTestWorker();
    const form = await post(worker, 'name=x', {
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(form.status).toBe(415);
    const broken = await post(worker, '{"name":');
    expect(broken.status).toBe(400);
    expect((await broken.json()).error.code).toBe('invalid_json');
  });

  test('invalid input returns 400 with field codes and stores nothing', async () => {
    const worker = createTestWorker();
    const response = await post(
      worker,
      validBody({
        name: '   ',
        email: 'not-an-email',
        message: undefined,
        consent: false,
      }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('invalid_input');
    expect(body.error.fields).toEqual({
      name: 'required',
      email: 'invalid',
      message: 'required',
      consent: 'required',
    });
    expect(rows(worker)).toHaveLength(0);
  });

  test('rejects a category outside the configured list', async () => {
    const worker = createTestWorker({
      options: { contact: { categories: ['press'] } },
    });
    const response = await post(worker, validBody({ category: 'other' }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.fields).toEqual({
      category: 'invalid',
    });
  });

  test('validates labeled categories by their values', async () => {
    const worker = createTestWorker({
      options: {
        contact: {
          categories: [
            { value: 'sales', label: { ja: '営業', en: 'Sales' } },
            'other',
          ],
        },
      },
    });
    expect((await post(worker, validBody({ category: 'sales' }))).status).toBe(
      200,
    );
    expect((await post(worker, validBody({ category: 'other' }))).status).toBe(
      200,
    );
    for (const category of ['営業', 'Sales']) {
      const response = await post(worker, validBody({ category }));
      expect(response.status).toBe(400);
      expect((await response.json()).error.fields).toEqual({
        category: 'invalid',
      });
    }
    expect(rows(worker).map((row) => row.category)).toEqual(
      expect.arrayContaining(['sales', 'other']),
    );
    expect(rows(worker)).toHaveLength(2);
    const config = await (await worker.fetch('/api/contact/config')).json();
    expect(config.categories).toEqual(['sales', 'other']);
  });

  test('error messages follow Accept-Language', async () => {
    const worker = createTestWorker({ env: { TURNSTILE_SECRET: undefined } });
    const ja = await post(worker, validBody(), {
      headers: { 'accept-language': 'ja,en;q=0.8' },
    });
    expect((await ja.json()).error.message).toContain('準備中');
    const en = await post(worker, validBody(), {
      headers: { 'accept-language': 'en-US' },
    });
    expect((await en.json()).error.message).toContain('not available');
  });

  test('a high spam score holds the submission and skips Slack', async () => {
    const worker = createTestWorker({ env: { SLACK_WEBHOOK_URL: SLACK_URL } });
    const response = await post(
      worker,
      validBody({
        message: 'See https://a.example https://b.example https://c.example',
      }),
    );
    expect(response.status).toBe(200);
    const [row] = rows(worker);
    expect(row?.status).toBe('held');
    expect(row?.spam_score).toBe(3);
    expect(external.slackCalls()).toHaveLength(0);
  });

  test('returns 500 when D1 rejects the insert', async () => {
    const worker = createTestWorker();
    worker.sqlite.exec('DROP TABLE submissions');
    const response = await post(worker, validBody());
    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe('server_error');
  });
});

describe('Slack notification', () => {
  test('contains no personal data and no message body', async () => {
    const worker = createTestWorker({
      env: { SLACK_WEBHOOK_URL: SLACK_URL },
      options: { contact: { categories: ['sales'] } },
    });
    const body = validBody();
    expect((await post(worker, body)).status).toBe(200);
    const [call] = external.slackCalls();
    expect(call?.url).toBe(SLACK_URL);
    const payload = JSON.parse(call?.body ?? '{}');
    expect(Object.keys(payload)).toEqual(['text']);
    for (const value of [
      body.name,
      body.email,
      body.company,
      body.phone,
      body.message,
      'Hanako',
      'hanako',
      CLIENT_IP,
    ]) {
      expect(call?.body).not.toContain(value);
    }
    const [row] = rows(worker);
    expect(payload.text).toContain('1 new inquiry');
    expect(payload.text).toContain('sales');
    expect(payload.text).toContain(`${ORIGIN}/admin/inquiries/${row?.id}`);
    expect(row?.notified_at).toBeNumber();
  });

  test('shows a category only when it is in the configured list', async () => {
    const worker = createTestWorker({ env: { SLACK_WEBHOOK_URL: SLACK_URL } });
    await post(worker, validBody({ category: 'Call me at 090-1111-2222' }));
    expect(external.slackCalls()[0]?.body).not.toContain('090-1111-2222');
  });

  test('shows the value of a labeled category, not its label', async () => {
    const worker = createTestWorker({
      env: { SLACK_WEBHOOK_URL: SLACK_URL },
      options: {
        locale: 'ja',
        contact: {
          categories: [{ value: 'press', label: { ja: '取材', en: 'Press' } }],
        },
      },
    });
    await post(worker, validBody({ category: 'press' }));
    const payload = JSON.parse(external.slackCalls()[0]?.body ?? '{}');
    expect(payload.text).toContain('種類: press');
    expect(payload.text).not.toContain('取材');
  });

  test('uses the configured locale', async () => {
    const worker = createTestWorker({
      env: { SLACK_WEBHOOK_URL: SLACK_URL },
      options: { locale: 'ja' },
    });
    await post(worker, validBody({ category: undefined }));
    expect(external.slackCalls()[0]?.body).toContain('新しいお問い合わせ');
  });

  test('a failing webhook does not change the response', async () => {
    external.restore();
    external = mockExternalFetch({
      slack: () => new Response('no', { status: 500 }),
    });
    const worker = createTestWorker({ env: { SLACK_WEBHOOK_URL: SLACK_URL } });
    const response = await post(worker, validBody());
    expect(response.status).toBe(200);
    expect(rows(worker)[0]?.notified_at).toBeNull();
  });

  test('a webhook URL that is not Slack is never called', async () => {
    const worker = createTestWorker({
      env: { SLACK_WEBHOOK_URL: 'https://attacker.example/hook' },
    });
    expect((await post(worker, validBody())).status).toBe(200);
    expect(external.calls.map((c) => c.url)).not.toContain(
      'https://attacker.example/hook',
    );
  });
});
