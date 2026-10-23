import type { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { storedFormDefinitionSchema } from '../features/contact-form/form-definition.ts';
import { createTestD1, openTestSqlite } from '../testing/sqlite-d1.ts';

const MIGRATIONS_DIR = join(import.meta.dir, '../../migrations');
const files = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith('.sql'))
  .sort();
const journal = JSON.parse(
  readFileSync(join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8'),
) as { entries: { idx: number; tag: string }[] };

describe('migrations', () => {
  // macOS can start a bun:sqlite connection with legacy_alter_table on, which
  // makes the 0006 rebuild of `submissions` fail. D1 never turns it on.
  test('are applied on a connection with legacy_alter_table off, like D1', () => {
    const { sqlite } = createTestD1();
    expect(sqlite.query('PRAGMA legacy_alter_table').get()).toEqual({
      legacy_alter_table: 0,
    });
  });

  test('0006 needs legacy_alter_table off, which is how D1 runs it', () => {
    const sqlite = openTestSqlite();
    sqlite.exec('PRAGMA legacy_alter_table = ON');
    expect(() => apply(sqlite, 0, files.length)).toThrow(
      /__new_submissions\.status|main\.submissions/,
    );
  });

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

  test('keep form_definitions append-only with triggers', () => {
    const { sqlite } = createTestD1();
    const triggers = sqlite
      .query(
        "SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'form_definitions' ORDER BY name",
      )
      .all();
    expect(triggers).toEqual([
      { name: 'form_definitions_no_delete' },
      { name: 'form_definitions_no_update' },
    ]);
  });
});

const apply = (sqlite: Database, from: number, to: number) => {
  for (const name of files.slice(from, to)) {
    sqlite.exec(readFileSync(join(MIGRATIONS_DIR, name), 'utf8'));
  }
};
const index = (prefix: string) =>
  files.findIndex((name) => name.startsWith(prefix));

describe('the contact fields migration (0004, 0005)', () => {
  test('moves existing submissions into fields without losing data', () => {
    const sqlite = openTestSqlite();
    apply(sqlite, 0, index('0004'));
    const insert = sqlite.query(
      `INSERT INTO submissions (id, created_at, name, email, company, phone,
        category, body, status, spam_score, spam_reasons, ip_hash, user_agent,
        country, page_path, consent_at, notified_at, read_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, '[]', 'hash', NULL,
        'JP', '/contact', ?2, NULL, NULL)`,
    );
    insert.run(
      'a',
      1,
      'Hanako',
      'a@example.org',
      'Yamada Shoten',
      '03-1234',
      'sales',
      'Line 1\nLine 2 "quoted" \'single\'',
      'new',
    );
    insert.run(
      'b',
      2,
      'Taro',
      'b@example.org',
      null,
      null,
      null,
      'Only a message',
      'done',
    );
    insert.run(
      'c',
      3,
      '=cmd',
      'c@example.org',
      '',
      null,
      'free text 営業',
      'こんにちは',
      'held',
    );
    apply(sqlite, index('0004'), index('0006'));

    const rows = sqlite
      .query(
        'SELECT id, email, status, fields, form_version, locale FROM submissions ORDER BY id',
      )
      .all() as {
      id: string;
      email: string;
      status: string;
      fields: string;
      form_version: number;
      locale: string | null;
    }[];
    expect(
      rows.map((row) => ({ ...row, fields: JSON.parse(row.fields) })),
    ).toEqual([
      {
        id: 'a',
        email: 'a@example.org',
        status: 'new',
        fields: {
          f_name: 'Hanako',
          f_company: 'Yamada Shoten',
          f_phone: '03-1234',
          f_category: 'sales',
          f_message: 'Line 1\nLine 2 "quoted" \'single\'',
        },
        form_version: 1,
        locale: null,
      },
      {
        id: 'b',
        email: 'b@example.org',
        status: 'done',
        fields: { f_name: 'Taro', f_message: 'Only a message' },
        form_version: 1,
        locale: null,
      },
      {
        id: 'c',
        email: 'c@example.org',
        status: 'held',
        fields: {
          f_name: '=cmd',
          f_company: '',
          f_category: 'free text 営業',
          f_message: 'こんにちは',
        },
        form_version: 1,
        locale: null,
      },
    ]);

    const columns = (
      sqlite
        .query("SELECT name FROM pragma_table_info('submissions')")
        .all() as {
        name: string;
      }[]
    ).map((column) => column.name);
    for (const old of ['name', 'company', 'phone', 'category', 'body']) {
      expect(columns).not.toContain(old);
    }
    expect(columns).toEqual(
      expect.arrayContaining(['email', 'fields', 'form_version', 'locale']),
    );
  });

  test('seeds version 1 with the fields the form had before', () => {
    const { sqlite } = createTestD1();
    const rows = sqlite
      .query(
        'SELECT version, definition, created_by, restored_from FROM form_definitions',
      )
      .all() as {
      version: number;
      definition: string;
      created_by: string | null;
      restored_from: number | null;
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      version: 1,
      created_by: null,
      restored_from: null,
    });
    const definition = storedFormDefinitionSchema.parse(
      JSON.parse(rows[0]!.definition),
    );
    expect(definition.archived).toEqual([]);
    expect(
      definition.fields.map((field) => [field.id, field.type, field.required]),
    ).toEqual([
      ['f_name', 'text', true],
      ['f_company', 'text', false],
      ['f_phone', 'tel', false],
      ['f_category', 'select', true],
      ['f_message', 'textarea', true],
    ]);
    expect(
      definition.fields
        .find((field) => field.id === 'f_category')
        ?.options?.map((option) => option.value),
    ).toEqual(['service', 'press', 'recruit', 'sales', 'other']);
    for (const field of definition.fields) {
      expect(field.label.ja).not.toBe('');
      expect(field.label.en).not.toBe('');
    }
  });

  test('new rows default to version 1 and an empty fields object', () => {
    const { sqlite } = createTestD1();
    sqlite.exec(
      `INSERT INTO submissions (id, created_at, email, consent_at) VALUES ('x', 1, 'x@example.org', 1)`,
    );
    expect(
      sqlite
        .query(
          "SELECT fields, form_version, status, suspected_spam FROM submissions WHERE id = 'x'",
        )
        .get(),
    ).toEqual({
      fields: '{}',
      form_version: 1,
      status: 'unread',
      suspected_spam: 0,
    });
  });
});

describe('the unread/read status migration (0006)', () => {
  test('maps the old statuses to unread/read and flags held and spam', () => {
    const sqlite = openTestSqlite();
    apply(sqlite, 0, index('0006'));
    const insert = sqlite.query(
      `INSERT INTO submissions (id, created_at, email, status, spam_score,
        spam_reasons, ip_hash, consent_at, read_at, locale, fields,
        form_version)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'hash', ?2, ?7, 'ja', ?8, 1)`,
    );
    const rows = [
      ['new', 0, '[]', null],
      ['read', 0, '[]', 10],
      ['done', 1, '["links:1"]', 20],
      ['held', 4, '["links:1","too_fast"]', null],
      ['spam', 0, '[]', 30],
    ] as const;
    for (const [i, [status, score, reasons, readAt]] of rows.entries()) {
      insert.run(
        status,
        i + 1,
        `${status}@example.org`,
        status,
        score,
        reasons,
        readAt,
        JSON.stringify({ f_name: status }),
      );
    }
    apply(sqlite, index('0006'), files.length);

    expect(
      sqlite
        .query(
          'SELECT id, status, suspected_spam, spam_score, spam_reasons, read_at, fields, created_at, email FROM submissions ORDER BY created_at',
        )
        .all(),
    ).toEqual(
      [
        ['new', 'unread', 0],
        ['read', 'read', 0],
        ['done', 'read', 0],
        ['held', 'read', 1],
        ['spam', 'read', 1],
      ].map(([id, status, suspected], i) => ({
        id,
        status,
        suspected_spam: suspected,
        spam_score: rows[i]![1],
        spam_reasons: rows[i]![2],
        read_at: rows[i]![3],
        fields: JSON.stringify({ f_name: id }),
        created_at: i + 1,
        email: `${id}@example.org`,
      })),
    );

    const indexes = sqlite
      .query(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'submissions' AND name LIKE 'idx_%' ORDER BY name",
      )
      .all();
    expect(indexes).toEqual([
      { name: 'idx_submissions_created' },
      { name: 'idx_submissions_status_created' },
      { name: 'idx_submissions_version_created' },
    ]);
    expect(() =>
      sqlite.exec(
        `INSERT INTO submissions (id, created_at, email, status, consent_at) VALUES ('x', 1, 'x@example.org', 'new', 1)`,
      ),
    ).toThrow();
  });
});
