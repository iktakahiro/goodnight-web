import { describe, expect, test } from 'bun:test';
import { createRecordingD1 } from '../../testing/recording-d1.ts';
import { createTestD1 } from '../../testing/sqlite-d1.ts';
import type { FormDefinition } from './form-definition.ts';
import {
  FORM_HISTORY_LIMIT,
  getCurrentForm,
  getFormVersion,
  getFormVersions,
  insertFormVersion,
  listFormHistory,
  MissingFormError,
} from './form-store.ts';

const definition = (label: string): FormDefinition => ({
  fields: [
    {
      id: 'f_name',
      type: 'text',
      label: { ja: label, en: label },
      required: true,
      showInList: true,
    },
  ],
  archived: [],
});

describe('form store', () => {
  test('the current form is the highest version', async () => {
    const { d1 } = createTestD1();
    expect((await getCurrentForm(d1)).version).toBe(1);
    const saved = await insertFormVersion(d1, {
      baseVersion: 1,
      definition: definition('A'),
      createdBy: 'admin@example.com',
      now: 5,
    });
    expect(saved).toMatchObject({ version: 2, createdAt: 5 });
    expect((await getCurrentForm(d1)).definition).toEqual(definition('A'));
  });

  test('a second save on the same base version returns null', async () => {
    const { d1 } = createTestD1();
    const save = (label: string) =>
      insertFormVersion(d1, {
        baseVersion: 1,
        definition: definition(label),
        createdBy: 'admin@example.com',
      });
    expect(await save('A')).not.toBeNull();
    expect(await save('B')).toBeNull();
    expect((await getCurrentForm(d1)).definition).toEqual(definition('A'));
  });

  test('a cached current form costs one small query', async () => {
    const { d1, statements } = createRecordingD1();
    await getCurrentForm(d1);
    statements.length = 0;
    await getCurrentForm(d1);
    expect(statements).toHaveLength(1);
    expect(statements[0]?.sql).toMatch(
      /^select "version" from "form_definitions"/,
    );
  });

  test('reads several versions in one query and skips missing ones', async () => {
    const { d1, statements } = createRecordingD1();
    await insertFormVersion(d1, {
      baseVersion: 1,
      definition: definition('A'),
      createdBy: 'admin@example.com',
    });
    statements.length = 0;
    const found = await getFormVersions(d1, [1, 1, 99]);
    expect([...found.keys()]).toEqual([1]);
    expect(await getFormVersion(d1, 99)).toBeNull();
  });

  test('reads more than 100 uncached versions within the D1 parameter limit', async () => {
    const { d1, sqlite, statements } = createRecordingD1();
    // Inserted directly, so none of them is in the cache.
    const insert = sqlite.prepare(
      'INSERT INTO form_definitions (version, definition, created_at) VALUES (?, ?, 0)',
    );
    const stored = JSON.stringify(definition('A'));
    sqlite.transaction(() => {
      for (let version = 2; version <= 251; version++) {
        insert.run(version, stored);
      }
    })();
    const wanted = Array.from({ length: 251 }, (_, index) => index + 1);
    const found = await getFormVersions(d1, wanted);
    expect([...found.keys()]).toEqual(wanted);
    expect(statements).toHaveLength(3);
    for (const statement of statements) {
      expect(statement.params.length).toBeLessThanOrEqual(100);
    }
  });

  test('history is newest first and bounded', async () => {
    const { d1 } = createTestD1();
    for (let base = 1; base <= FORM_HISTORY_LIMIT + 2; base++) {
      await insertFormVersion(d1, {
        baseVersion: base,
        definition: definition(String(base)),
        createdBy: 'admin@example.com',
      });
    }
    const history = await listFormHistory(d1);
    expect(history).toHaveLength(FORM_HISTORY_LIMIT);
    expect(history[0]).toMatchObject({
      version: FORM_HISTORY_LIMIT + 3,
      fieldCount: 1,
      createdBy: 'admin@example.com',
    });
    expect(history[0]).not.toHaveProperty('definition');
  });

  test('throws MissingFormError without any version', async () => {
    const { d1, sqlite } = createTestD1();
    sqlite.exec('DROP TRIGGER form_definitions_no_delete');
    sqlite.exec('DELETE FROM form_definitions');
    await expect(getCurrentForm(d1)).rejects.toBeInstanceOf(MissingFormError);
  });

  test('refuses a stored definition that does not parse', async () => {
    const { d1, sqlite } = createTestD1();
    sqlite.exec(
      `INSERT INTO form_definitions (version, definition, created_at) VALUES (2, '{"fields":[{"id":"__proto__"}],"archived":[]}', 0)`,
    );
    await expect(getCurrentForm(d1)).rejects.toThrow();
  });
});
