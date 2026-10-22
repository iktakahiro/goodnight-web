import { describe, expect, test } from 'bun:test';
import { createTestWorker, SECRETS } from '../../testing/test-worker.ts';

const assets = { fetch: async () => new Response('site') };

describe('HTTPS for the admin areas', () => {
  test.each([
    '/admin',
    '/admin/inquiries/abc?x=1',
    '/api/setup',
    '/api/auth/get-session',
    '/api/admin/me',
    '/%61dmin',
  ])('GET http://example.com%s redirects to https', async (path) => {
    const worker = createTestWorker();
    const response = await worker.fetch(`http://example.com${path}`);
    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(`https://example.com${path}`);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  test('POST /api/setup over http is refused and creates nothing', async () => {
    const worker = createTestWorker();
    const response = await worker.fetch('http://example.com/api/setup', {
      method: 'POST',
      headers: {
        origin: 'http://example.com',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        token: SECRETS.SETUP_TOKEN,
        email: 'admin@example.com',
      }),
    });
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('https_required');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(worker.sqlite.query('SELECT COUNT(*) AS n FROM user').get()).toEqual(
      { n: 0 },
    );
    expect(worker.rateLimitKeys).toEqual([]);
  });

  test('POST to Better Auth over http is refused', async () => {
    const worker = createTestWorker();
    const response = await worker.fetch(
      'http://example.com/api/auth/passkey/verify-authentication',
      { method: 'POST', headers: { origin: 'http://example.com' } },
    );
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('https_required');
  });

  test.each([
    'http://localhost:8787',
    'http://127.0.0.1:8787',
    'http://[::1]:8787',
  ])('%s is allowed for local development', async (origin) => {
    const worker = createTestWorker();
    const response = await worker.fetch(`${origin}/api/setup`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({
        token: SECRETS.SETUP_TOKEN,
        email: 'admin@example.com',
      }),
    });
    expect(response.status).toBe(200);
  });

  test('the contact API and the site are not redirected', async () => {
    const worker = createTestWorker({ env: { ASSETS: assets } });
    expect(
      (await worker.fetch('http://example.com/api/contact/config')).status,
    ).toBe(200);
    expect((await worker.fetch('http://example.com/about')).status).toBe(200);
  });
});
