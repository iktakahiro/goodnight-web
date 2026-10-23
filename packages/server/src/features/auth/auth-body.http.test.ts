import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { signInAsAdmin } from '../../testing/admin-session.ts';
import {
  createTestWorker,
  ORIGIN,
  type TestWorker,
} from '../../testing/test-worker.ts';
import { AUTH_MAX_BODY_BYTES } from './auth-routes.ts';
import { getAuth } from './auth.ts';

const VERIFY_PATH = '/api/auth/passkey/verify-authentication';
const JSON_HEADERS = { origin: ORIGIN, 'content-type': 'application/json' };

// JSON of exactly `bytes` bytes.
const jsonOfSize = (bytes: number): string => {
  const padding = bytes - JSON.stringify({ a: '' }).length;
  return JSON.stringify({ a: 'x'.repeat(padding) });
};

// Counts the requests that reach Better Auth's handler.
const watchHandler = (worker: TestWorker) => {
  const auth = getAuth(worker.env, ORIGIN);
  return spyOn(auth, 'handler');
};

const expectSignedOut = async (worker: TestWorker, cookie: string) => {
  const me = await worker.fetch('/api/admin/me', { headers: { cookie } });
  expect(me.status).toBe(401);
};

let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  restore = undefined;
});

describe('/api/auth request bodies', () => {
  test('a 20 MiB body gets 413 and never reaches Better Auth', async () => {
    const worker = createTestWorker();
    const handler = watchHandler(worker);
    restore = () => handler.mockRestore();
    const response = await worker.fetch(VERIFY_PATH, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: jsonOfSize(20 * 1024 * 1024),
    });
    expect(response.status).toBe(413);
    expect((await response.json()).error.code).toBe('payload_too_large');
    expect(handler).not.toHaveBeenCalled();
    expect(worker.rateLimitKeys).toEqual([]);
  });

  test('a chunked body without Content-Length is counted and gets 413', async () => {
    const worker = createTestWorker();
    const handler = watchHandler(worker);
    restore = () => handler.mockRestore();
    const chunk = new TextEncoder().encode('x'.repeat(16 * 1024));
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      start: (controller) => {
        controller.enqueue(new TextEncoder().encode('{"a":"'));
      },
      pull: (controller) => {
        // Far more than the limit; the reader must stop early.
        if (sent++ < 1024) controller.enqueue(chunk);
        else controller.close();
      },
    });
    const response = await worker.fetch(VERIFY_PATH, {
      method: 'POST',
      headers: JSON_HEADERS,
      body,
    });
    expect(response.status).toBe(413);
    expect(sent).toBeLessThan(16);
    expect(handler).not.toHaveBeenCalled();
  });

  test('a body just under the limit reaches Better Auth', async () => {
    const worker = createTestWorker();
    const handler = watchHandler(worker);
    restore = () => handler.mockRestore();
    const body = jsonOfSize(AUTH_MAX_BODY_BYTES - 1024);
    expect(body.length).toBeGreaterThan(63 * 1024 - 1);
    const response = await worker.fetch(VERIFY_PATH, {
      method: 'POST',
      headers: JSON_HEADERS,
      body,
    });
    // Better Auth rejects the payload itself: it is not a WebAuthn response.
    expect(response.status).toBe(400);
    expect(handler).toHaveBeenCalledTimes(1);
    const forwarded = handler.mock.calls[0]?.[0];
    expect(forwarded?.headers.get('content-length')).toBeNull();
    expect(forwarded?.method).toBe('POST');
    expect(forwarded?.url).toBe(`${ORIGIN}${VERIFY_PATH}`);
  });

  test('a body over the limit by one byte gets 413', async () => {
    const worker = createTestWorker();
    const response = await worker.fetch(VERIFY_PATH, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: jsonOfSize(AUTH_MAX_BODY_BYTES + 1),
    });
    expect(response.status).toBe(413);
  });

  test.each([
    'text/plain',
    'application/x-www-form-urlencoded',
    'multipart/form-data-application/json',
    'application/jsonx',
    'application/problem+json',
    '',
  ])('Content-Type %p gets 415', async (contentType) => {
    const worker = createTestWorker();
    const handler = watchHandler(worker);
    restore = () => handler.mockRestore();
    const response = await worker.fetch(VERIFY_PATH, {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-type': contentType },
      body: '{}',
    });
    expect(response.status).toBe(415);
    expect((await response.json()).error.code).toBe('unsupported_media_type');
    expect(handler).not.toHaveBeenCalled();
  });

  test('a body without Content-Type gets 415', async () => {
    const worker = createTestWorker();
    const request = new Request(`${ORIGIN}${VERIFY_PATH}`, {
      method: 'POST',
      body: new TextEncoder().encode('{}'),
    });
    expect(request.headers.get('content-type')).toBeNull();
    const response = await worker.fetch(VERIFY_PATH, {
      method: 'POST',
      headers: { origin: ORIGIN },
      body: request.body,
    });
    expect(response.status).toBe(415);
  });

  test('accepts application/json with a charset parameter', async () => {
    const worker = createTestWorker();
    const response = await worker.fetch(VERIFY_PATH, {
      method: 'POST',
      headers: {
        origin: ORIGIN,
        'content-type': 'Application/JSON; charset=utf-8',
      },
      body: '{"response":{}}',
    });
    expect(response.status).toBe(400);
  });

  test('sign-out works with an empty body and no Content-Type', async () => {
    const worker = createTestWorker();
    const cookie = await signInAsAdmin(worker);
    expect(
      (await worker.fetch('/api/admin/me', { headers: { cookie } })).status,
    ).toBe(200);
    const response = await worker.fetch('/api/auth/sign-out', {
      method: 'POST',
      headers: { origin: ORIGIN, cookie },
    });
    expect(response.status).toBe(200);
    await expectSignedOut(worker, cookie);
  });

  test('sign-out works with the JSON body the auth client sends', async () => {
    const worker = createTestWorker();
    const cookie = await signInAsAdmin(worker);
    const response = await worker.fetch('/api/auth/sign-out', {
      method: 'POST',
      headers: { ...JSON_HEADERS, cookie },
      body: '{}',
    });
    expect(response.status).toBe(200);
    await expectSignedOut(worker, cookie);
  });

  test('GET requests are passed through unchanged', async () => {
    const worker = createTestWorker();
    const handler = watchHandler(worker);
    restore = () => handler.mockRestore();
    const response = await worker.fetch('/api/auth/get-session');
    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
