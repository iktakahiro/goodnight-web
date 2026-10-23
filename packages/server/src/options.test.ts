import { describe, expect, test } from 'bun:test';
import { resolveOptions } from './options.ts';

describe('resolveOptions', () => {
  test('defaults to English and the request hostname', () => {
    expect(resolveOptions()).toEqual({
      locale: 'en',
      siteName: undefined,
      contact: { turnstileHostnames: undefined },
    });
  });

  test('keeps the locale, site name, and Turnstile hostnames', () => {
    expect(
      resolveOptions({
        locale: 'ja',
        siteName: '  My Company ',
        contact: { turnstileHostnames: ['www.example.com'] },
      }),
    ).toEqual({
      locale: 'ja',
      siteName: 'My Company',
      contact: { turnstileHostnames: ['www.example.com'] },
    });
  });

  test('a blank site name counts as not set', () => {
    expect(resolveOptions({ siteName: ' \t ' }).siteName).toBeUndefined();
  });
});
