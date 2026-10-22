import { describe, expect, test } from 'bun:test';
import { detailPath, loginPath, matchRoute, safeNextPath } from './routes.ts';

describe('matchRoute', () => {
  test.each([
    ['/admin', { name: 'list' }],
    ['/admin/', { name: 'list' }],
    ['/admin/login', { name: 'login' }],
    ['/admin/setup/', { name: 'setup' }],
    ['/admin/inquiries/01JABCDEF', { name: 'detail', id: '01JABCDEF' }],
    ['/admin/inquiries/a%20b', { name: 'detail', id: 'a b' }],
    ['/admin/inquiries/%E0%A4%A', { name: 'not-found' }],
    ['/admin/inquiries', { name: 'not-found' }],
    ['/admin/inquiries/a/b', { name: 'not-found' }],
    ['/admin/nope', { name: 'not-found' }],
  ])('%s', (path, expected) => {
    expect(matchRoute(path)).toEqual(expected as ReturnType<typeof matchRoute>);
  });

  test('detailPath round-trips through matchRoute', () => {
    expect(matchRoute(detailPath('x/y?z'))).toEqual({
      name: 'detail',
      id: 'x/y?z',
    });
  });
});

describe('next parameter', () => {
  test('keeps admin paths, including the Slack deep link', () => {
    expect(loginPath('/admin/inquiries/01J')).toBe(
      '/admin/login?next=%2Fadmin%2Finquiries%2F01J',
    );
    expect(safeNextPath('/admin/inquiries/01J')).toBe('/admin/inquiries/01J');
    expect(safeNextPath('/admin?status=new')).toBe('/admin?status=new');
  });

  test('refuses other sites and non-admin paths', () => {
    for (const value of [
      'https://evil.example/admin',
      '//evil.example/admin',
      '/administrator',
      '/admin\\@evil.example',
      '/',
      null,
    ]) {
      expect(safeNextPath(value)).toBe('/admin');
    }
    expect(loginPath('https://evil.example')).toBe('/admin/login');
    expect(loginPath('/admin/login')).toBe('/admin/login');
  });
});
