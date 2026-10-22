import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { storedFormDefinitionSchema } from '../features/contact-form/form-definition.ts';
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

describe('the contact fields migration (0004, 0005)', () => {
  const apply = (sqlite: Database, from: number, to: number) => {
    for (const name of files.slice(from, to)) {
      sqlite.exec(readFileSync(join(MIGRATIONS_DIR, name), 'utf8'));
    }
  };
  const index = (prefix: string) =>
    files.findIndex((name) => name.startsWith(prefix));

  test('moves existing submissions into fields without losing data', () => {
    const sqlite = new Database(':memory:');
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
    apply(sqlite, index('0004'), files.length);

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
        .query("SELECT fields, form_version FROM submissions WHERE id = 'x'")
        .get(),
    ).toEqual({ fields: '{}', form_version: 1 });
  });
});
