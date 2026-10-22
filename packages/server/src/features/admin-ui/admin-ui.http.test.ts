import { describe, expect, test } from 'bun:test';
import { createTestWorker } from '../../testing/test-worker.ts';
import { ADMIN_CSP } from '../security-headers/security-headers.ts';
import { adminFiles } from './admin-files.gen.ts';
import { serveAdminFile } from './serve-admin-file.ts';

const files = {
  '/admin/index.html': {
    type: 'text/html; charset=utf-8',
    etag: '"i"',
    body: '<html>',
  },
  '/admin/assets/app-abc.js': {
    type: 'text/javascript; charset=utf-8',
    etag: '"j"',
    body: 'js',
  },
};
const serve = (path: string, headers: Record<string, string> = {}) =>
  serveAdminFile(new Request(`https://example.com${path}`, { headers }), files);

describe('serveAdminFile', () => {
  test('serves index.html for /admin, /admin/, and SPA deep links', async () => {
    for (const path of ['/admin', '/admin/', '/admin/inquiries/abc']) {
      const response = serve(path);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('<html>');
      expect(response.headers.get('cache-control')).toBe('no-cache');
    }
  });

  test('serves hashed assets as immutable and answers 304', () => {
    const response = serve('/admin/assets/app-abc.js');
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=31536000, immutable',
    );
    expect(response.headers.get('etag')).toBe('"j"');
    expect(
      serve('/admin/assets/app-abc.js', { 'if-none-match': '"j"' }).status,
    ).toBe(304);
  });

  test('returns 404 for a missing file', () => {
    expect(serve('/admin/assets/missing.js').status).toBe(404);
  });
});

describe('security headers', () => {
  test('admin pages get the admin CSP', async () => {
    const worker = createTestWorker();
    const response = await worker.fetch('/admin/inquiries/abc');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toBe(ADMIN_CSP);
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('strict-transport-security')).toContain(
      'max-age',
    );
  });

  test('API responses get a strict CSP and no-store', async () => {
    const worker = createTestWorker();
    for (const path of ['/api/contact/config', '/api/admin/me', '/api/nope']) {
      const response = await worker.fetch(path);
      expect(response.headers.get('content-security-policy')).toBe(
        "default-src 'none'; frame-ancestors 'none'",
      );
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    }
  });

  test('other paths go to Static Assets unchanged', async () => {
    const worker = createTestWorker({
      env: {
        ASSETS: {
          fetch: async () =>
            new Response('site', { headers: { 'x-site': '1' } }),
        },
      },
    });
    const response = await worker.fetch('/about');
    expect(await response.text()).toBe('site');
    expect(response.headers.get('content-security-policy')).toBeNull();
  });

  test('unknown API paths return a JSON 404', async () => {
    const worker = createTestWorker();
    const response = await worker.fetch('/api/nope');
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe('not_found');
  });
});

describe('embedded admin UI build', () => {
  test('index.html loads hashed files from /admin/assets/', () => {
    const index = adminFiles['/admin/index.html']?.body ?? '';
    const assets = [
      ...index.matchAll(/(?:src|href)="(\/admin\/assets\/[^"]+)"/g),
    ].map((match) => match[1] ?? '');
    expect(assets.length).toBeGreaterThanOrEqual(2);
    for (const path of assets) expect(adminFiles[path]).toBeDefined();
  });

  test('works under the admin CSP: no inline scripts or styles', () => {
    const index = adminFiles['/admin/index.html']?.body ?? '';
    expect(index).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
    expect(index).not.toContain('<style');
    expect(index).not.toMatch(/\sstyle="/);
    expect(index).not.toMatch(/\son[a-z]+="/);
  });
});
