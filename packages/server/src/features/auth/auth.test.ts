import { expect, test } from 'bun:test';
import type { GoodnightEnv } from '../../env.ts';
import { createTestD1 } from '../../testing/sqlite-d1.ts';
import { SECRETS } from '../../testing/test-worker.ts';
import { getAuth, isAuthConfigured } from './auth.ts';

const env = (): GoodnightEnv => ({ DB: createTestD1().d1, ...SECRETS });

test('reuses the instance for the same env and origin', () => {
  const e = env();
  const a = getAuth(e, 'https://example.com');
  expect(getAuth(e, 'https://example.com')).toBe(a);
  expect(getAuth(e, 'https://www.example.com')).not.toBe(a);
  expect(getAuth(env(), 'https://example.com')).not.toBe(a);
});

test('requires a BETTER_AUTH_SECRET of at least 32 characters', () => {
  expect(isAuthConfigured({ ...env(), BETTER_AUTH_SECRET: undefined })).toBe(
    false,
  );
  expect(isAuthConfigured({ ...env(), BETTER_AUTH_SECRET: 'short' })).toBe(
    false,
  );
  expect(isAuthConfigured(env())).toBe(true);
});
