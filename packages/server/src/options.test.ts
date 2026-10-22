import { describe, expect, test } from 'bun:test';
import { resolveOptions } from './options.ts';

describe('resolveOptions', () => {
  test('defaults to English and the request hostname', () => {
    expect(resolveOptions()).toEqual({
      locale: 'en',
      contact: { turnstileHostnames: undefined },
    });
  });

  test('keeps the locale and Turnstile hostnames', () => {
    expect(
      resolveOptions({
        locale: 'ja',
        contact: { turnstileHostnames: ['www.example.com'] },
      }),
    ).toEqual({
      locale: 'ja',
      contact: { turnstileHostnames: ['www.example.com'] },
    });
  });
});
