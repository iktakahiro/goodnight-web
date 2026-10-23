import { describe, expect, test } from 'bun:test';
import { getContactForm, submitContact } from './contact-client.ts';

const input = {
  email: 'taro@example.org',
  consent: true,
  fields: { f_name: 'Taro', f_message: 'Hello', f_topics: ['a', 'b'] },
  formVersion: 3,
  turnstileToken: 't',
};

const fakeFetch = (
  respond: (request: Request) => Response | Promise<Response>,
) =>
  (async (url: string | URL | Request, init?: RequestInit) =>
    respond(
      new Request(new URL(String(url), 'https://example.com'), init),
    )) as typeof fetch;

describe('submitContact', () => {
  test('posts JSON to /api/contact and returns ok', async () => {
    let seen: Request | undefined;
    const result = await submitContact(input, {
      locale: 'ja',
      fetch: fakeFetch((request) => {
        seen = request;
        return Response.json({ ok: true });
      }),
    });
    expect(result).toEqual({ ok: true });
    expect(seen?.method).toBe('POST');
    expect(new URL(seen?.url ?? '').pathname).toBe('/api/contact');
    expect(seen?.headers.get('accept-language')).toBe('ja');
    expect(await seen?.json()).toEqual(input);
  });

  test('returns the typed error from the API', async () => {
    const result = await submitContact(input, {
      fetch: fakeFetch(() =>
        Response.json(
          {
            error: {
              code: 'invalid_input',
              message: 'Some fields are missing or not valid.',
              fields: { email: 'invalid' },
            },
          },
          { status: 400 },
        ),
      ),
    });
    expect(result).toEqual({
      ok: false,
      code: 'invalid_input',
      status: 400,
      message: 'Some fields are missing or not valid.',
      fields: { email: 'invalid' },
    });
  });

  test('returns payload_too_large for a 413 from the API', async () => {
    const result = await submitContact(input, {
      fetch: fakeFetch(() =>
        Response.json(
          {
            error: {
              code: 'payload_too_large',
              message: 'The message is too long.',
            },
          },
          { status: 413 },
        ),
      ),
    });
    expect(result).toEqual({
      ok: false,
      code: 'payload_too_large',
      status: 413,
      message: 'The message is too long.',
    });
  });

  test('returns network_error when the request fails', async () => {
    const result = await submitContact(input, {
      locale: 'ja',
      fetch: (async () => {
        throw new TypeError('offline');
      }) as unknown as typeof fetch,
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'network_error',
      status: 0,
    });
  });

  test('returns server_error for a non-JSON error page', async () => {
    const result = await submitContact(input, {
      fetch: fakeFetch(() => new Response('<html>', { status: 502 })),
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'server_error',
      status: 502,
    });
  });
});

describe('getContactForm', () => {
  test('reads /api/contact/form', async () => {
    let seen: Request | undefined;
    const form = { available: true, version: 2, fields: [] };
    const result = await getContactForm({
      fetch: fakeFetch((request) => {
        seen = request;
        return Response.json(form);
      }),
    });
    expect(result).toEqual(form as never);
    expect(new URL(seen?.url ?? '').pathname).toBe('/api/contact/form');
    expect(seen?.cache).not.toBe('no-cache');
  });

  test('skips the browser cache with fresh', async () => {
    let seen: Request | undefined;
    await getContactForm({
      fresh: true,
      fetch: fakeFetch((request) => {
        seen = request;
        return Response.json({});
      }),
    });
    expect(seen?.cache).toBe('no-cache');
  });

  test('returns null on failure', async () => {
    expect(
      await getContactForm({
        fetch: fakeFetch(() => new Response('', { status: 500 })),
      }),
    ).toBeNull();
    expect(
      await getContactForm({
        fetch: (async () => {
          throw new TypeError('offline');
        }) as unknown as typeof fetch,
      }),
    ).toBeNull();
  });
});
