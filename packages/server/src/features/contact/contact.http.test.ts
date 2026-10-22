import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { hmacSha256Hex } from '../../shared/crypto.ts';
import { insertFormVersion } from '../contact-form/form-store.ts';
import { captureConsole } from '../../testing/console-capture.ts';
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

const validFields = {
  f_name: 'Hanako Yamada',
  f_company: 'Yamada Shoten',
  f_phone: '03-1234-5678',
  f_category: 'sales',
  f_message: 'I would like to know more about your services.',
};

const validBody = (
  overrides: Record<string, unknown> = {},
  fields: Record<string, unknown> = {},
) => ({
  email: 'hanako@example.org',
  fields: { ...validFields, ...fields },
  consent: true,
  formVersion: 1,
  locale: 'ja',
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
    const worker = createTestWorker();
    const response = await post(worker, validBody());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const [row] = rows(worker);
    expect(row).toMatchObject({
      email: 'hanako@example.org',
      form_version: 1,
      locale: 'ja',
      status: 'new',
      spam_score: 0,
      page_path: '/contact',
    });
    expect(JSON.parse(String(row?.fields))).toEqual(validFields);
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

  test('a filled honeypot stores nothing and is answered with success', async () => {
    const worker = createTestWorker();
    const logs = captureConsole();
    let response: Response;
    let logged: string;
    try {
      response = await post(
        worker,
        validBody(
          { website: 'https://spam.example', turnstileToken: undefined },
          { f_message: '=HYPERLINK("https://evil.example")' },
        ),
      );
      logged = logs.text();
    } finally {
      logs.restore();
    }
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(rows(worker)).toHaveLength(0);
    const dump = dumpDatabase(worker.sqlite);
    expect(dump).not.toContain('hanako@example.org');
    expect(dump).not.toContain('HYPERLINK');
    expect(logged).toContain('honeypot');
    expect(logged).not.toContain('hanako@example.org');
    expect(external.turnstileCalls()).toHaveLength(0);
    expect(external.slackCalls()).toHaveLength(0);
  });

  test('honeypot hits count against the rate limit', async () => {
    const worker = createTestWorker({ rateLimit: 2 });
    for (let i = 0; i < 4; i++) {
      const response = await post(worker, validBody({ website: 'x' }));
      expect(response.status).toBe(200);
    }
    const ipHash = await hmacSha256Hex(SECRETS.IP_HASH_SECRET, CLIENT_IP);
    expect(worker.rateLimitKeys).toEqual(Array(4).fill(ipHash));
    expect(rows(worker)).toHaveLength(0);
    // The same address is now over the limit for a real submission too.
    const real = await post(worker, validBody());
    expect(real.status).toBe(429);
    expect(rows(worker)).toHaveLength(0);
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
    const form = await (await worker.fetch('/api/contact/form')).json();
    expect(form).toMatchObject({ available: false, turnstileSiteKey: null });
    expect(form.fields).toHaveLength(5);
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

  test('rejects a body over 32 KB with 413 before parsing', async () => {
    const worker = createTestWorker();
    const big = JSON.stringify(
      validBody({}, { f_message: 'a'.repeat(33_000) }),
    );
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
    const fixed = await post(
      worker,
      validBody({ email: 'not-an-email', consent: false }),
    );
    expect(fixed.status).toBe(400);
    expect((await fixed.json()).error.fields).toEqual({
      email: 'invalid',
      consent: 'required',
    });
    const response = await post(
      worker,
      validBody({}, { f_name: '   ', f_message: undefined }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('invalid_input');
    expect(body.error.fields).toEqual({
      f_name: 'required',
      f_message: 'required',
    });
    expect(rows(worker)).toHaveLength(0);
  });

  test('rejects an option value that the field does not have', async () => {
    const worker = createTestWorker();
    for (const category of ['営業', 'Business proposal', 'other ', 'nope']) {
      const response = await post(
        worker,
        validBody({}, { f_category: category }),
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error.fields).toEqual({
        f_category: 'invalid',
      });
    }
    expect(
      (await post(worker, validBody({}, { f_category: 'other' }))).status,
    ).toBe(200);
    expect(rows(worker)).toHaveLength(1);
  });

  test('rejects too long values with the field id', async () => {
    const worker = createTestWorker();
    const response = await post(
      worker,
      validBody({}, { f_name: 'a'.repeat(101), f_message: 'b'.repeat(5001) }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.fields).toEqual({
      f_name: 'too_long',
      f_message: 'too_long',
    });
  });

  test.each([
    ['an unknown id', '{"f_unknown":"x"}'],
    ['a fixed field name', '{"email":"x@example.org"}'],
    ['an own __proto__ key', '{"__proto__":{"isAdmin":true}}'],
    ['constructor', '{"constructor":{"prototype":{"x":1}}}'],
    ['a SQL-like key', '{"f_name\') OR 1=1 --":"x"}'],
  ])('rejects %s in fields with 400', async (_name, extra) => {
    const worker = createTestWorker();
    const body = JSON.stringify(validBody()).replace(
      '"fields":{',
      `"fields":${extra.slice(0, -1)},`,
    );
    const response = await post(worker, body);
    expect(response.status).toBe(400);
    const error = (await response.json()).error;
    expect(error.code).toBe('invalid_input');
    expect(error.fields).toEqual({ fields: 'invalid' });
    expect(rows(worker)).toHaveLength(0);
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
  });

  test('rejects stored values over 16 KB with 413', async () => {
    const worker = createTestWorker();
    await insertFormVersion(worker.env.DB, {
      baseVersion: 1,
      createdBy: 'admin@example.com',
      definition: {
        fields: [
          {
            id: 'f_long',
            type: 'textarea',
            label: { ja: '詳細', en: 'Details' },
            required: true,
            maxLength: 10_000,
            showInList: false,
          },
        ],
        archived: [],
      },
    });
    const send = (text: string) =>
      post(worker, {
        ...validBody({ formVersion: 2 }),
        fields: { f_long: text },
      });
    // 6,000 three-byte characters: 18 KB of values in a body under 32 KB.
    const response = await send('あ'.repeat(6000));
    expect(response.status).toBe(413);
    expect((await response.json()).error.code).toBe('payload_too_large');
    expect(rows(worker)).toHaveLength(0);
    expect((await send('あ'.repeat(5000))).status).toBe(200);
    expect((await send('a'.repeat(10_000))).status).toBe(200);
    expect(rows(worker).map((row) => row.form_version)).toEqual([2, 2]);
  });

  test('a stale formVersion returns 409 and stores nothing', async () => {
    const worker = createTestWorker();
    const response = await post(worker, validBody({ formVersion: 7 }));
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('form_outdated');
    expect(rows(worker)).toHaveLength(0);
    // Without formVersion the current form is used.
    expect(
      (await post(worker, validBody({ formVersion: undefined }))).status,
    ).toBe(200);
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
      validBody(
        {},
        {
          f_message:
            'See https://a.example https://b.example https://c.example',
        },
      ),
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

  test('logs no submitted values when D1 rejects the insert', async () => {
    const worker = createTestWorker();
    worker.sqlite.exec('DROP TABLE submissions');
    const logs = captureConsole();
    try {
      expect((await post(worker, validBody())).status).toBe(500);
      const logged = logs.text();
      expect(logged).toContain('no such table');
      for (const value of ['hanako@example.org', 'Hanako', 'services']) {
        expect(logged).not.toContain(value);
      }
    } finally {
      logs.restore();
    }
  });
});

describe('GET /api/contact/form', () => {
  test('returns the current fields and the public settings', async () => {
    const worker = createTestWorker();
    const response = await worker.fetch('/api/contact/form');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=30');
    const form = await response.json();
    expect(form).toMatchObject({
      available: true,
      turnstileSiteKey: SECRETS.TURNSTILE_SITE_KEY,
      turnstileAction: 'contact',
      honeypotField: 'website',
      version: 1,
      email: { maxLength: 254 },
    });
    expect(form.fields.map((field: { id: string }) => field.id)).toEqual([
      'f_name',
      'f_company',
      'f_phone',
      'f_category',
      'f_message',
    ]);
    expect(form.fields[0]).toEqual({
      id: 'f_name',
      type: 'text',
      label: { ja: 'お名前', en: 'Name' },
      placeholder: { ja: '山田 太郎', en: 'Taro Yamada' },
      required: true,
      maxLength: 100,
    });
    expect(form.fields[3].options[0]).toEqual({
      value: 'service',
      label: { ja: 'サービスについて', en: 'Services' },
    });
    // Admin-only settings are not public.
    expect(JSON.stringify(form)).not.toContain('showInList');
    expect(JSON.stringify(form)).not.toContain('archived');
    for (const secret of [
      SECRETS.TURNSTILE_SECRET,
      SECRETS.IP_HASH_SECRET,
      SECRETS.BETTER_AUTH_SECRET,
      SECRETS.SETUP_TOKEN,
    ]) {
      expect(JSON.stringify(form)).not.toContain(secret);
    }
  });

  test('other API responses stay no-store', async () => {
    const worker = createTestWorker();
    const post = await worker.fetch('/api/contact', { method: 'POST' });
    expect(post.headers.get('cache-control')).toBe('no-store');
    const missing = await worker.fetch('/api/contact/nope');
    expect(missing.headers.get('cache-control')).toBe('no-store');
  });

  test('an error is no-store', async () => {
    const worker = createTestWorker();
    worker.sqlite.exec('DROP TRIGGER form_definitions_no_delete');
    worker.sqlite.exec('DELETE FROM form_definitions');
    const logs = captureConsole();
    try {
      const response = await worker.fetch('/api/contact/form');
      expect(response.status).toBe(500);
      expect(response.headers.get('cache-control')).toBe('no-store');
    } finally {
      logs.restore();
    }
  });
});

describe('Slack notification', () => {
  test('contains no personal data and no field values', async () => {
    const worker = createTestWorker({ env: { SLACK_WEBHOOK_URL: SLACK_URL } });
    const body = validBody();
    expect((await post(worker, body)).status).toBe(200);
    const [call] = external.slackCalls();
    expect(call?.url).toBe(SLACK_URL);
    const payload = JSON.parse(call?.body ?? '{}');
    expect(Object.keys(payload)).toEqual(['text']);
    for (const value of [
      body.email,
      ...Object.values(validFields),
      'Hanako',
      'hanako',
      'Yamada',
      'Business proposal',
      CLIENT_IP,
    ]) {
      expect(call?.body).not.toContain(value);
    }
    const [row] = rows(worker);
    const lines = String(payload.text).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('1 new inquiry');
    expect(lines[1]).toMatch(
      /^Received: <!date\^\d+\^\{date_short_pretty\} \{time\}\|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z>$/,
    );
    expect(lines[2]).toBe(
      `<${ORIGIN}/admin/inquiries/${row?.id}|Open the admin screen>`,
    );
    expect(row?.notified_at).toBeNumber();
  });

  test('uses the configured locale', async () => {
    const worker = createTestWorker({
      env: { SLACK_WEBHOOK_URL: SLACK_URL },
      options: { locale: 'ja' },
    });
    await post(worker, validBody());
    const body = external.slackCalls()[0]?.body ?? '';
    expect(body).toContain('新しいお問い合わせ');
    expect(body).toContain('受信日時');
    expect(body).not.toContain('お名前');
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
