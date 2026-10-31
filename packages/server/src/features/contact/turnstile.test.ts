import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { captureConsole } from '../../testing/console-capture.ts';
import { verifyTurnstile } from './turnstile.ts';

const expected = {
  secret: 'test-secret-do-not-disclose',
  token: 'test-token',
  remoteIp: '192.0.2.1',
  hostnames: ['example.com', 'www.example.com'],
  action: 'contact',
};
const valid = { success: true, hostname: 'www.example.com', action: 'contact' };

let fetchSpy: ReturnType<typeof spyOn> | undefined;
afterEach(() => {
  fetchSpy?.mockRestore();
  fetchSpy = undefined;
});

const respondWith = (body: unknown) => {
  fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async () =>
    Response.json(body)) as unknown as typeof fetch);
};

describe('verifyTurnstile', () => {
  test('accepts a successful verification with an allowed hostname and the expected action', async () => {
    respondWith(valid);
    expect(await verifyTurnstile(expected)).toEqual({ ok: true });
  });

  test.each([
    ['unsuccessful verification', { ...valid, success: false }, 'not_success'],
    [
      'hostname mismatch',
      { ...valid, hostname: 'evil.example' },
      'hostname_mismatch',
    ],
    [
      'missing hostname',
      { success: true, action: 'contact' },
      'hostname_mismatch',
    ],
    ['action mismatch', { ...valid, action: 'login' }, 'action_mismatch'],
    [
      'missing action',
      { success: true, hostname: 'www.example.com' },
      'action_mismatch',
    ],
    ['non-object body', null, 'request_failed'],
  ] as const)('rejects %s', async (_name, body, reason) => {
    respondWith(body);
    expect(await verifyTurnstile(expected)).toEqual({ ok: false, reason });
  });

  test('sends the credentials, token, and optional IP to Siteverify', async () => {
    const requests: { input: string | URL | Request; init?: RequestInit }[] =
      [];
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      requests.push({ input, init });
      return Response.json(valid);
    }) as unknown as typeof fetch);

    expect(await verifyTurnstile(expected)).toEqual({ ok: true });
    expect(await verifyTurnstile({ ...expected, remoteIp: undefined })).toEqual(
      { ok: true },
    );
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(String(request.input)).toBe(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      );
      expect(request.init?.method).toBe('POST');
      expect(request.init?.body).toBeInstanceOf(FormData);
      const form = request.init?.body as FormData;
      expect(form.get('secret')).toBe(expected.secret);
      expect(form.get('response')).toBe(expected.token);
    }
    expect((requests[0]!.init!.body as FormData).get('remoteip')).toBe(
      expected.remoteIp,
    );
    expect((requests[1]!.init!.body as FormData).has('remoteip')).toBe(false);
  });

  test.each(['non-2xx', 'network error', 'invalid JSON', 'malformed body'])(
    'fails closed without exposing the secret on %s',
    async (failure) => {
      const logs = captureConsole();
      try {
        fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async () => {
          if (failure === 'network error') throw new Error(expected.secret);
          if (failure === 'non-2xx')
            return new Response(expected.secret, { status: 503 });
          if (failure === 'invalid JSON') return new Response(expected.secret);
          return Response.json(null);
        }) as unknown as typeof fetch);
        const result = await verifyTurnstile(expected);
        expect(result).toEqual({ ok: false, reason: 'request_failed' });
        expect(JSON.stringify(result)).not.toContain(expected.secret);
        expect(logs.text()).not.toContain(expected.secret);
      } finally {
        logs.restore();
      }
    },
  );
});
