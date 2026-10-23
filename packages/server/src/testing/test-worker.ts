import type { Database } from 'bun:sqlite';
import type { RateLimit } from '@cloudflare/workers-types';
import { createGoodnightWorker } from '../app.ts';
import type { GoodnightEnv } from '../env.ts';
import type { GoodnightWorkerOptions } from '../options.ts';
import { createTestD1, type StatementPause } from './sqlite-d1.ts';

/** Origin used by test requests. */
export const ORIGIN = 'https://example.com';

/** Client IP used by test requests. Must never appear in the database. */
export const CLIENT_IP = '203.0.113.42';

/** Secrets for tests: the four-variable setup. */
export const SECRETS = {
  SETUP_TOKEN: 'test-setup-token-0123456789abcdefghij',
  ADMIN_EMAILS: 'admin@example.com, Second@Example.com',
  BETTER_AUTH_SECRET: 'test-better-auth-secret-0123456789abcdef',
  IP_HASH_SECRET: 'test-ip-hash-secret-0123456789abcdef',
  TURNSTILE_SECRET: 'test-turnstile-secret',
  TURNSTILE_SITE_KEY: 'test-site-key',
} as const;

/** `APP_SECRET` for tests. */
export const APP_SECRET = 'test-app-secret-0123456789abcdefghijklmn';

/**
 * Secrets for tests: the two-value setup. `APP_SECRET` stands in for
 * `SETUP_TOKEN`, `BETTER_AUTH_SECRET`, and `IP_HASH_SECRET`.
 */
export const APP_SECRET_ONLY = {
  APP_SECRET,
  ADMIN_EMAILS: SECRETS.ADMIN_EMAILS,
  TURNSTILE_SECRET: SECRETS.TURNSTILE_SECRET,
  TURNSTILE_SITE_KEY: SECRETS.TURNSTILE_SITE_KEY,
} as const;

/** Which secrets a test Worker starts with. */
export type TestSecrets = 'legacy' | 'app-secret';

/** In-memory stand-in for the Rate Limiting binding. */
export const createTestRateLimiter = (limit = 5) => {
  const counts = new Map<string, number>();
  const keys: string[] = [];
  const limiter = {
    limit: async ({ key }: { key: string }) => {
      keys.push(key);
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return { success: count <= limit };
    },
  };
  return { limiter: limiter as RateLimit, keys };
};

/** Test harness: a Worker, its env, and helpers to call it. */
export interface TestWorker {
  env: GoodnightEnv;
  /**
   * The value setup accepts: `SETUP_TOKEN` when it is set, otherwise
   * `APP_SECRET`.
   */
  setupToken: string;
  sqlite: Database;
  rateLimitKeys: string[];
  /** Holds the next D1 statement matching `pattern` (see `createTestD1`). */
  pauseAt: (pattern: RegExp) => StatementPause;
  /** Calls the Worker and waits for its `ctx.waitUntil` tasks. */
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
}

/**
 * Creates a Worker with an in-memory D1 and every setting present. Pass
 * `env` overrides (`undefined` removes a setting). `secrets` picks the
 * four-variable setup ({@link SECRETS}, the default) or `APP_SECRET` alone
 * ({@link APP_SECRET_ONLY}).
 */
export const createTestWorker = ({
  env: overrides = {},
  options,
  rateLimit = 5,
  secrets = 'legacy',
}: {
  env?: Partial<Record<keyof GoodnightEnv, unknown>>;
  options?: GoodnightWorkerOptions;
  rateLimit?: number;
  secrets?: TestSecrets;
} = {}): TestWorker => {
  const { d1, sqlite, pauseAt } = createTestD1();
  const { limiter, keys } = createTestRateLimiter(rateLimit);
  const env = {
    DB: d1,
    CONTACT_RATE_LIMITER: limiter,
    ...(secrets === 'legacy' ? SECRETS : APP_SECRET_ONLY),
    ...overrides,
  } as GoodnightEnv;
  const app = createGoodnightWorker(options);
  return {
    env,
    get setupToken() {
      return env.SETUP_TOKEN || (env.APP_SECRET ?? '');
    },
    sqlite,
    rateLimitKeys: keys,
    pauseAt,
    fetch: async (path, init = {}) => {
      const tasks: Promise<unknown>[] = [];
      const ctx = {
        waitUntil: (task: Promise<unknown>) => {
          tasks.push(task);
        },
        passThroughOnException: () => {},
        props: {},
      };
      const headers = new Headers(init.headers);
      if (!headers.has('cf-connecting-ip')) {
        headers.set('cf-connecting-ip', CLIENT_IP);
      }
      const response = await app.fetch(
        new Request(new URL(path, ORIGIN), { ...init, headers }),
        env,
        ctx,
      );
      await Promise.all(tasks);
      return response;
    },
  };
};

/** Returns every value in every table as one string, for leak checks. */
export const dumpDatabase = (sqlite: Database): string => {
  const tables = sqlite
    .query("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all() as { name: string }[];
  return tables
    .map(({ name }) =>
      JSON.stringify(sqlite.query(`SELECT * FROM "${name}"`).all()),
    )
    .join('\n');
};
