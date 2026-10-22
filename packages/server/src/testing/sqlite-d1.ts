import { Database, type SQLQueryBindings } from 'bun:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { D1Database } from '@cloudflare/workers-types';

const MIGRATIONS_DIR = join(import.meta.dir, '../../migrations');

type Value = SQLQueryBindings;

const toBinding = (value: unknown): Value => {
  // D1 accepts null, numbers, strings, booleans, and ArrayBuffers. Reject the
  // rest like D1 does, so tests catch values D1 would not store.
  if (value === undefined) {
    throw new Error('D1_TYPE_ERROR: Type undefined is not supported');
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'string' ||
    typeof value === 'bigint'
  ) {
    return value;
  }
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new Error(`D1_TYPE_ERROR: Type ${typeof value} is not supported`);
};

class Statement {
  constructor(
    private readonly db: Database,
    private readonly sql: string,
    private readonly params: Value[] = [],
  ) {}

  bind(...values: unknown[]): Statement {
    return new Statement(this.db, this.sql, values.map(toBinding));
  }

  private execute() {
    const statement = this.db.query(this.sql);
    const rows = statement.all(...this.params) as Record<string, unknown>[];
    const { changes, lastInsertRowid } = this.db
      .query(
        'SELECT changes() AS changes, last_insert_rowid() AS lastInsertRowid',
      )
      .get() as { changes: number; lastInsertRowid: number };
    const isWrite = !/^\s*(SELECT|WITH|PRAGMA)\b/i.test(this.sql);
    return {
      results: rows,
      success: true as const,
      meta: {
        changes: isWrite ? changes : 0,
        last_row_id: lastInsertRowid,
        duration: 0,
        changed_db: isWrite && changes > 0,
        size_after: 0,
        rows_read: rows.length,
        rows_written: isWrite ? changes : 0,
      },
    };
  }

  async all() {
    return this.execute();
  }

  async run() {
    return this.execute();
  }

  async first(column?: string) {
    const row = this.execute().results[0];
    if (!row) return null;
    return column === undefined ? row : (row[column] ?? null);
  }

  async raw() {
    return this.db.query(this.sql).values(...this.params);
  }

  runInTransaction() {
    return this.execute();
  }
}

/**
 * Test-only D1 stand-in backed by an in-memory `bun:sqlite` database with the
 * package migrations applied. It covers the D1 API the package and Better
 * Auth use (`prepare`, `bind`, `first`, `all`, `run`, `raw`, `batch`,
 * `exec`). The end-to-end test runs against real local D1 in `wrangler dev`.
 */
export const createTestD1 = (): { d1: D1Database; sqlite: Database } => {
  const sqlite = new Database(':memory:');
  for (const file of readdirSync(MIGRATIONS_DIR).sort()) {
    if (file.endsWith('.sql')) {
      sqlite.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    }
  }
  const d1 = {
    prepare: (sql: string) => new Statement(sqlite, sql),
    batch: async (statements: Statement[]) =>
      sqlite.transaction(() =>
        statements.map((statement) => statement.runInTransaction()),
      )(),
    exec: async (sql: string) => {
      sqlite.exec(sql);
      return { count: 1, duration: 0 };
    },
    dump: async () => new ArrayBuffer(0),
    withSession: () => d1,
  };
  return { d1: d1 as unknown as D1Database, sqlite };
};
