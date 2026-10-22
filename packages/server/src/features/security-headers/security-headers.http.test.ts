import { describe, expect, test } from 'bun:test';
import { createTestWorker } from '../../testing/test-worker.ts';
import { ADMIN_CSP, API_CSP } from './security-headers.ts';

// Static Assets stand-in that answers every path, like a site whose asset
// config serves a page for unknown paths.
const assets = {
  fetch: async () => new Response('site', { headers: { 'x-site': '1' } }),
};

describe('security headers after path normalization', () => {
  test.each([
    '/%61dmin',
    '/%61dmin/inquiries/abc',
    '//admin',
    '//admin/inquiries',
    '/admin/..%2f',
    '/admin/..%2fabout',
    '/admin%2finquiries',
    '/ADMIN',
  ])('%s gets the admin CSP', async (path) => {
    const worker = createTestWorker({ env: { ASSETS: assets } });
    const response = await worker.fetch(`https://example.com${path}`);
    expect(response.headers.get('content-security-policy')).toBe(ADMIN_CSP);
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  test.each([
    '/%61pi/admin/me',
    '//api/admin/me',
    '/api//admin/submissions',
    '/api/admin/..%2fadmin/me',
    '/api%2fadmin/me',
    '/API/admin/me',
    '/%61pi/setup',
    '/api/%61uth/get-session',
  ])('%s gets the API CSP and no-store', async (path) => {
    const worker = createTestWorker({ env: { ASSETS: assets } });
    const response = await worker.fetch(`https://example.com${path}`);
    expect(response.headers.get('content-security-policy')).toBe(API_CSP);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
  });

  test('site paths are passed through unchanged', async () => {
    const worker = createTestWorker({ env: { ASSETS: assets } });
    for (const path of ['/about', '/administration', '/blog/..%2fabout']) {
      const response = await worker.fetch(`https://example.com${path}`);
      expect(await response.text()).toBe('site');
      expect(response.headers.get('content-security-policy')).toBeNull();
    }
  });
});
