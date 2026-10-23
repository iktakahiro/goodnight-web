import { describe, expect, test } from 'bun:test';
import { createTestWorker } from '../../testing/test-worker.ts';
import { getAuth, MAX_AUTH_INSTANCES_PER_ENV } from './auth.ts';

describe('getAuth instance cache', () => {
  test('reuses the instance for the same env and origin', () => {
    const { env } = createTestWorker();
    expect(getAuth(env, 'https://example.com')).toBe(
      getAuth(env, 'https://example.com'),
    );
  });

  test('keeps at most MAX_AUTH_INSTANCES_PER_ENV origins, dropping the least recently used', () => {
    const { env } = createTestWorker();
    const origin = (i: number) => `https://site-${i}.example`;
    const first = getAuth(env, origin(0));
    const second = getAuth(env, origin(1));
    for (let i = 2; i < MAX_AUTH_INSTANCES_PER_ENV; i++)
      getAuth(env, origin(i));
    // Using origin 0 again makes origin 1 the least recently used.
    expect(getAuth(env, origin(0))).toBe(first);
    getAuth(env, origin(MAX_AUTH_INSTANCES_PER_ENV));
    expect(getAuth(env, origin(0))).toBe(first);
    expect(getAuth(env, origin(1))).not.toBe(second);
  });

  test('gives a new env a new instance', () => {
    const a = createTestWorker().env;
    const b = createTestWorker().env;
    expect(getAuth(a, 'https://example.com')).not.toBe(
      getAuth(b, 'https://example.com'),
    );
  });
});
