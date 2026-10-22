import { describe, expect, test } from 'bun:test';
import {
  adminBasepathRewrite,
  safeNextPath,
  toAdminPath,
  toRouterHref,
} from './admin-paths.ts';

describe('safeNextPath', () => {
  test('keeps admin paths, including the Slack deep link', () => {
    expect(safeNextPath('/admin/inquiries/01J')).toBe('/admin/inquiries/01J');
    expect(safeNextPath('/admin?status=new')).toBe('/admin?status=new');
    expect(safeNextPath('/admin')).toBe('/admin');
  });

  test('refuses other sites and non-admin paths', () => {
    for (const value of [
      'https://evil.example/admin',
      '//evil.example/admin',
      '/administrator',
      '/admin\\@evil.example',
      '/',
      null,
      undefined,
      42,
    ]) {
      expect(safeNextPath(value)).toBe('/admin');
    }
  });
});

describe('router hrefs', () => {
  test.each([
    ['/', '/admin'],
    ['/?status=new&page=2', '/admin?status=new&page=2'],
    ['/inquiries/01J', '/admin/inquiries/01J'],
    ['/login?next=x', '/admin/login?next=x'],
  ])('%s <-> %s', (href, adminPath) => {
    expect(toAdminPath(href)).toBe(adminPath);
    expect(toRouterHref(adminPath)).toBe(href);
  });
});

describe('adminBasepathRewrite', () => {
  const input = (path: string) =>
    adminBasepathRewrite.input({ url: new URL(path, 'https://example.com') })
      .pathname;
  const output = (path: string) =>
    adminBasepathRewrite.output({ url: new URL(path, 'https://example.com') })
      .pathname;

  test('strips the basepath, with or without a trailing slash', () => {
    expect(input('/admin')).toBe('/');
    expect(input('/admin/')).toBe('/');
    expect(input('/admin/inquiries/01J')).toBe('/inquiries/01J');
  });

  test('leaves other paths alone', () => {
    expect(input('/administrator')).toBe('/administrator');
  });

  test('writes the list as /admin, without a trailing slash', () => {
    expect(output('/')).toBe('/admin');
    expect(output('/inquiries/01J')).toBe('/admin/inquiries/01J');
  });
});
