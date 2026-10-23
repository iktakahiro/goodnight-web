import { describe, expect, test } from 'bun:test';
import type { GoodnightEnv } from '../env.ts';
import {
  APP_SECRET_LABELS,
  deriveAppSecretKey,
  resolveAppSecret,
  secretProblem,
  setupTokenName,
} from './app-secret.ts';
import { MIN_SECRET_LENGTH, secretState } from './secret-length.ts';

const APP_SECRET = 'test-app-secret-0123456789abcdefghijklmn';
const OTHER_APP_SECRET = 'other-app-secret-0123456789abcdefghijklm';
const SET_BY_HAND = 'set-by-hand-secret-0123456789abcdefghijk';

const env = (values: Partial<Record<keyof GoodnightEnv, unknown>>) =>
  ({ DB: {}, ...values }) as GoodnightEnv;

describe('deriveAppSecretKey', () => {
  // Computed outside this code base, with Python's hmac module and with
  // `openssl kdf -keylen 32 -kdfopt digest:SHA256 -kdfopt key:<secret>
  // -kdfopt info:<label> HKDF`. A change here signs every admin out and
  // changes every IP hash on every site that uses APP_SECRET.
  test('matches known answers for both labels', async () => {
    expect(
      await deriveAppSecretKey(
        APP_SECRET,
        APP_SECRET_LABELS.BETTER_AUTH_SECRET,
      ),
    ).toBe('af7c279901d9c12a37df860dea63524b4abf5918e5e3772f16393e9e46b5003e');
    expect(
      await deriveAppSecretKey(APP_SECRET, APP_SECRET_LABELS.IP_HASH_SECRET),
    ).toBe('a980d1517ce7ea10a17fd99829fe425cb833387e698257e890124c301ec41a1a');
  });

  test('matches RFC 5869 test case 3 (empty salt and info)', async () => {
    expect(await deriveAppSecretKey('\x0b'.repeat(22), '')).toBe(
      '8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d',
    );
  });

  test('keeps the labels fixed', () => {
    expect(APP_SECRET_LABELS).toEqual({
      BETTER_AUTH_SECRET: 'goodnight-web:better-auth',
      IP_HASH_SECRET: 'goodnight-web:ip-hash',
    });
  });

  test('gives independent, stable keys that pass the secret check', async () => {
    const auth = await deriveAppSecretKey(
      APP_SECRET,
      APP_SECRET_LABELS.BETTER_AUTH_SECRET,
    );
    const ip = await deriveAppSecretKey(
      APP_SECRET,
      APP_SECRET_LABELS.IP_HASH_SECRET,
    );
    expect(auth).not.toBe(ip);
    expect(auth).not.toBe(APP_SECRET);
    expect(ip).not.toBe(APP_SECRET);
    expect(auth).not.toContain(APP_SECRET);
    expect(ip).not.toContain(APP_SECRET);
    for (const key of [auth, ip]) {
      expect(key).toMatch(/^[0-9a-f]{64}$/);
      expect(secretState(key)).toBe('ok');
    }
    expect(
      await deriveAppSecretKey(
        APP_SECRET,
        APP_SECRET_LABELS.BETTER_AUTH_SECRET,
      ),
    ).toBe(auth);
    expect(
      await deriveAppSecretKey(
        OTHER_APP_SECRET,
        APP_SECRET_LABELS.BETTER_AUTH_SECRET,
      ),
    ).not.toBe(auth);
    expect(
      await deriveAppSecretKey(
        OTHER_APP_SECRET,
        APP_SECRET_LABELS.IP_HASH_SECRET,
      ),
    ).not.toBe(ip);
    expect(
      await deriveAppSecretKey(APP_SECRET, 'goodnight-web:other'),
    ).not.toBe(auth);
  });
});

describe('resolveAppSecret', () => {
  test('fills in every secret from APP_SECRET alone', async () => {
    const resolved = await resolveAppSecret(env({ APP_SECRET }));
    expect(resolved.BETTER_AUTH_SECRET).toBe(
      await deriveAppSecretKey(
        APP_SECRET,
        APP_SECRET_LABELS.BETTER_AUTH_SECRET,
      ),
    );
    expect(resolved.IP_HASH_SECRET).toBe(
      await deriveAppSecretKey(APP_SECRET, APP_SECRET_LABELS.IP_HASH_SECRET),
    );
    expect(resolved.SETUP_TOKEN).toBe(APP_SECRET);
    expect(resolved.APP_SECRET).toBe(APP_SECRET);
  });

  test('lets a value set by hand win, even a too short one', async () => {
    const short = 's'.repeat(MIN_SECRET_LENGTH - 1);
    const resolved = await resolveAppSecret(
      env({
        APP_SECRET,
        SETUP_TOKEN: SET_BY_HAND,
        BETTER_AUTH_SECRET: short,
        IP_HASH_SECRET: SET_BY_HAND,
      }),
    );
    expect(resolved.SETUP_TOKEN).toBe(SET_BY_HAND);
    expect(resolved.BETTER_AUTH_SECRET).toBe(short);
    expect(resolved.IP_HASH_SECRET).toBe(SET_BY_HAND);
  });

  test('treats an empty value as unset', async () => {
    const resolved = await resolveAppSecret(
      env({
        APP_SECRET,
        SETUP_TOKEN: '',
        BETTER_AUTH_SECRET: '',
        IP_HASH_SECRET: '',
      }),
    );
    expect(resolved.SETUP_TOKEN).toBe(APP_SECRET);
    expect(resolved.BETTER_AUTH_SECRET).toMatch(/^[0-9a-f]{64}$/);
    expect(resolved.IP_HASH_SECRET).toMatch(/^[0-9a-f]{64}$/);
  });

  test('derives nothing from an APP_SECRET of 31 characters', async () => {
    const resolved = await resolveAppSecret(
      env({ APP_SECRET: APP_SECRET.slice(0, MIN_SECRET_LENGTH - 1) }),
    );
    expect(resolved.SETUP_TOKEN).toBeUndefined();
    expect(resolved.BETTER_AUTH_SECRET).toBeUndefined();
    expect(resolved.IP_HASH_SECRET).toBeUndefined();
  });

  test('accepts an APP_SECRET of 32 characters', async () => {
    const appSecret = APP_SECRET.slice(0, MIN_SECRET_LENGTH);
    const resolved = await resolveAppSecret(env({ APP_SECRET: appSecret }));
    expect(resolved.SETUP_TOKEN).toBe(appSecret);
    expect(resolved.BETTER_AUTH_SECRET).toMatch(/^[0-9a-f]{64}$/);
  });

  test('changes nothing in the four-variable setup', async () => {
    const values = {
      SETUP_TOKEN: SET_BY_HAND,
      BETTER_AUTH_SECRET: `${SET_BY_HAND}-auth`,
      IP_HASH_SECRET: `${SET_BY_HAND}-ip`,
    };
    const resolved = await resolveAppSecret(env(values));
    expect(resolved.SETUP_TOKEN).toBe(values.SETUP_TOKEN);
    expect(resolved.BETTER_AUTH_SECRET).toBe(values.BETTER_AUTH_SECRET);
    expect(resolved.IP_HASH_SECRET).toBe(values.IP_HASH_SECRET);
    expect(resolved.APP_SECRET).toBeUndefined();
  });

  test('returns the same object until APP_SECRET changes', async () => {
    const source = env({ APP_SECRET });
    const first = await resolveAppSecret(source);
    expect(await resolveAppSecret(source)).toBe(first);
    expect(await resolveAppSecret(first)).toBe(first);
    source.APP_SECRET = OTHER_APP_SECRET;
    // The old view hands out no keys for the new value (fail closed).
    expect(first.BETTER_AUTH_SECRET).toBeUndefined();
    expect(first.SETUP_TOKEN).toBeUndefined();
    const second = await resolveAppSecret(source);
    expect(second).not.toBe(first);
    expect(second.SETUP_TOKEN).toBe(OTHER_APP_SECRET);
    expect(second.BETTER_AUTH_SECRET).toBe(
      await deriveAppSecretKey(
        OTHER_APP_SECRET,
        APP_SECRET_LABELS.BETTER_AUTH_SECRET,
      ),
    );
  });

  test('reads other settings from env on every access', async () => {
    const source = env({ APP_SECRET, ADMIN_EMAILS: 'a@example.com' });
    const resolved = await resolveAppSecret(source);
    source.ADMIN_EMAILS = 'b@example.com';
    expect(resolved.ADMIN_EMAILS).toBe('b@example.com');
    expect(resolved.DB).toBe(source.DB);
    expect('DB' in resolved).toBe(true);
    expect('SETUP_TOKEN' in resolved).toBe(true);
    expect('TURNSTILE_SECRET' in resolved).toBe(false);
    expect(Object.keys(resolved).sort()).toEqual([
      'ADMIN_EMAILS',
      'APP_SECRET',
      'BETTER_AUTH_SECRET',
      'DB',
      'IP_HASH_SECRET',
      'SETUP_TOKEN',
    ]);
  });
});

describe('secretProblem', () => {
  const problems = async (
    values: Partial<Record<keyof GoodnightEnv, unknown>>,
  ) => {
    const resolved = await resolveAppSecret(env(values));
    return (
      ['SETUP_TOKEN', 'BETTER_AUTH_SECRET', 'IP_HASH_SECRET'] as const
    ).map((name) => secretProblem(resolved, name));
  };
  const short = 'x'.repeat(MIN_SECRET_LENGTH - 1);

  test('reports nothing with a usable APP_SECRET', async () => {
    expect(await problems({ APP_SECRET })).toEqual([null, null, null]);
  });

  test('reports APP_SECRET when nothing is set', async () => {
    const missing = { name: 'APP_SECRET', issue: 'missing' } as const;
    expect(await problems({})).toEqual([missing, missing, missing]);
  });

  test('reports APP_SECRET when it is too short', async () => {
    const tooShort = { name: 'APP_SECRET', issue: 'too_short' } as const;
    expect(await problems({ APP_SECRET: short })).toEqual([
      tooShort,
      tooShort,
      tooShort,
    ]);
  });

  test('reports a value set by hand under its own name', async () => {
    expect(await problems({ APP_SECRET, BETTER_AUTH_SECRET: short })).toEqual([
      null,
      { name: 'BETTER_AUTH_SECRET', issue: 'too_short' },
      null,
    ]);
  });

  test('reports only APP_SECRET for the secrets it would fill in', async () => {
    expect(
      await problems({ SETUP_TOKEN: SET_BY_HAND, IP_HASH_SECRET: SET_BY_HAND }),
    ).toEqual([null, { name: 'APP_SECRET', issue: 'missing' }, null]);
  });
});

describe('setupTokenName', () => {
  test('names SETUP_TOKEN only when it is set', async () => {
    expect(setupTokenName(await resolveAppSecret(env({ APP_SECRET })))).toBe(
      'APP_SECRET',
    );
    expect(
      setupTokenName(
        await resolveAppSecret(env({ APP_SECRET, SETUP_TOKEN: SET_BY_HAND })),
      ),
    ).toBe('SETUP_TOKEN');
    expect(
      setupTokenName(await resolveAppSecret(env({ SETUP_TOKEN: '' }))),
    ).toBe('APP_SECRET');
  });
});
