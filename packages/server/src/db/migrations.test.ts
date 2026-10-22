import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestD1 } from '../testing/sqlite-d1.ts';

const MIGRATIONS_DIR = join(import.meta.dir, '../../migrations');
const files = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith('.sql'))
  .sort();
const journal = JSON.parse(
  readFileSync(join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8'),
) as { entries: { idx: number; tag: string }[] };

describe('migrations', () => {
  test('are numbered 0000, 0001, ... in the order wrangler applies them', () => {
    expect(files.length).toBeGreaterThan(0);
    files.forEach((name, index) => {
      expect(name).toMatch(/^\d{4}_[a-z0-9_]+\.sql$/);
      expect(name.slice(0, 4)).toBe(String(index).padStart(4, '0'));
    });
  });

  test('match the drizzle-kit journal one to one', () => {
    expect(journal.entries.map((entry) => `${entry.tag}.sql`)).toEqual(files);
    expect(journal.entries.map((entry) => entry.idx)).toEqual(
      files.map((_, index) => index),
    );
  });

  // On D1, `PRAGMA foreign_keys=OFF` has no effect inside a migration, so
  // dropping `user` to rebuild it cascades and deletes every session,
  // account, and passkey (docs/decisions/0005).
  test('never drop the user table', () => {
    for (const name of files) {
      const sql = readFileSync(join(MIGRATIONS_DIR, name), 'utf8');
      expect({
        name,
        drops: /drop\s+table\s+[`"]?user[`"]?\s*;/i.test(sql),
      }).toEqual({ name, drops: false });
    }
  });

  test('leave the passkey_closes_setup trigger in place', () => {
    const { sqlite } = createTestD1();
    const trigger = sqlite
      .query(
        "SELECT tbl_name FROM sqlite_master WHERE type = 'trigger' AND name = 'passkey_closes_setup'",
      )
      .get();
    expect(trigger).toEqual({ tbl_name: 'passkey' });
  });
});
