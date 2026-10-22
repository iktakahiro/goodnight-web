import { describe, expect, test } from 'bun:test';
import {
  isAdminArea,
  normalizePath,
  pathArea,
  requestArea,
} from './request-path.ts';

describe('normalizePath', () => {
  test.each([
    ['/admin', '/admin'],
    ['/%61dmin', '/admin'],
    ['//admin', '/admin'],
    ['/admin/', '/admin'],
    ['/admin/..%2f', '/'],
    ['/x/..%2fadmin', '/admin'],
    ['/%2561dmin', '/admin'],
    ['/./admin/./x', '/admin/x'],
    ['/a/b/../../admin', '/admin'],
    ['\\admin', '/admin'],
    ['/%5cadmin', '/admin'],
    ['/API/Admin/me', '/api/admin/me'],
    ['/bad%zzpath/%61', '/bad%zzpath/a'],
    ['/', '/'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizePath(input)).toBe(expected);
  });
});

describe('pathArea', () => {
  test.each([
    ['/admin', 'admin-ui'],
    ['/%61dmin/inquiries', 'admin-ui'],
    ['//admin', 'admin-ui'],
    ['/adminx', 'site'],
    ['/api/admin/me', 'admin-api'],
    ['/%61pi/admin/me', 'admin-api'],
    ['/api%2fadmin/me', 'admin-api'],
    ['/api/setup', 'setup'],
    ['/api/setup/', 'setup'],
    ['/api/auth/get-session', 'auth'],
    ['//api//auth/x', 'auth'],
    ['/api/contact', 'api'],
    ['/api/nope', 'api'],
    ['/about', 'site'],
    ['/admin/..%2fabout', 'site'],
  ])('%s -> %s', (input, expected) => {
    expect(pathArea(input)).toBe(expected as ReturnType<typeof pathArea>);
  });

  test('requestArea prefers the routed path', () => {
    const url = 'https://example.com/admin/..%2f';
    expect(pathArea('/admin/..%2f')).toBe('site');
    expect(requestArea(url, '/admin/..%2f')).toBe('admin-ui');
    expect(requestArea('https://example.com//admin', '//admin')).toBe(
      'admin-ui',
    );
    expect(requestArea('https://example.com/%61dmin', '/admin')).toBe(
      'admin-ui',
    );
    expect(requestArea('https://example.com/about', '/about')).toBe('site');
  });

  test('admin areas', () => {
    expect(isAdminArea('admin-ui')).toBe(true);
    expect(isAdminArea('admin-api')).toBe(true);
    expect(isAdminArea('setup')).toBe(true);
    expect(isAdminArea('auth')).toBe(true);
    expect(isAdminArea('api')).toBe(false);
    expect(isAdminArea('site')).toBe(false);
  });
});
