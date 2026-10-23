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

/** Secrets for tests. */
export const SECRETS = {
  SETUP_TOKEN: 'test-setup-token-0123456789abcdefghij',
  ADMIN_EMAILS: 'admin@example.com, Second@Example.com',
  BETTER_AUTH_SECRET: 'test-better-auth-secret-0123456789abcdef',
  IP_HASH_SECRET: 'test-ip-hash-secret-0123456789abcdef',
  TURNSTILE_SECRET: 'test-turnstile-secret',
  TURNSTILE_SITE_KEY: 'test-site-key',
} as const;

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
  sqlite: Database;
  rateLimitKeys: string[];
  /** Holds the next D1 statement matching `pattern` (see `createTestD1`). */
  pauseAt: (pattern: RegExp) => StatementPause;
  /** Calls the Worker and waits for its `ctx.waitUntil` tasks. */
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
}

/**
 * Creates a Worker with an in-memory D1 and every setting present. Pass
 * `env` overrides (`undefined` removes a setting). Names outside
 * `GoodnightEnv` stand for other Worker vars.
 */
export const createTestWorker = ({
  env: overrides = {},
  options,
  rateLimit = 5,
}: {
  env?: Partial<Record<keyof GoodnightEnv, unknown>> & Record<string, unknown>;
  options?: GoodnightWorkerOptions;
  rateLimit?: number;
} = {}): TestWorker => {
  const { d1, sqlite, pauseAt } = createTestD1();
  const { limiter, keys } = createTestRateLimiter(rateLimit);
  const env = {
    DB: d1,
    CONTACT_RATE_LIMITER: limiter,
    ...SECRETS,
    ...overrides,
  } as GoodnightEnv;
  const app = createGoodnightWorker(options);
  return {
    env,
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
