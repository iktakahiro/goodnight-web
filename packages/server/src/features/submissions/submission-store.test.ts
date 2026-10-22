import { describe, expect, test } from 'bun:test';
import { createRecordingD1 } from '../../testing/recording-d1.ts';
import { testSubmission } from '../../testing/submissions.ts';
import {
  getSubmission,
  insertSubmission,
  listSubmissions,
  submissionBatches,
  updateStatus,
  type NewSubmission,
} from './submission-store.ts';
import {
  SUBMISSION_STATUSES,
  type SubmissionStatus,
} from './submission-status.ts';

const INJECTION = "new' OR 1=1 --";

const submission = (id: string, overrides: Partial<NewSubmission> = {}) =>
  testSubmission(id, { createdAt: 1_700_000_000_000, ...overrides });

describe('submission store', () => {
  test('binds the status, limit, and offset as parameters', async () => {
    const { d1, statements } = createRecordingD1();
    await insertSubmission(d1, submission('a'));
    statements.length = 0;
    const page = await listSubmissions(d1, {
      filter: { status: INJECTION as SubmissionStatus },
      limit: 7,
      offset: 3,
    });
    expect(page).toEqual({ items: [], total: 0 });
    const [select, total] = statements;
    expect(select?.sql).not.toContain(INJECTION);
    expect(select?.sql).toMatch(/ limit \? offset \?$/);
    expect(select?.params).toEqual([INJECTION, 7, 3]);
    expect(total?.sql).not.toContain(INJECTION);
    expect(total?.params).toEqual([INJECTION]);
  });

  test('uses the same SQL text for every status and page', async () => {
    const { d1, statements } = createRecordingD1();
    const run = async (status: string, limit: number, offset: number) => {
      statements.length = 0;
      await listSubmissions(d1, {
        filter: { status: status as SubmissionStatus },
        limit,
        offset,
      });
      return statements.map((s) => s.sql);
    };
    const texts = new Set<string>();
    for (const [status, limit, offset] of [
      ['new', 50, 50],
      ['spam', 1, 99_950],
      [INJECTION, 100, 7],
    ] as const) {
      texts.add((await run(status, limit, offset)).join('\n'));
    }
    expect(texts.size).toBe(1);
    // Drizzle leaves out a zero offset; the limit is still bound.
    const [firstPage] = await run('new', 50, 0);
    expect(firstPage).toMatch(/ limit \?$/);
    expect(statements[0]?.params).toEqual(['new', 50]);
  });

  test('looks up an id as a value, not as SQL', async () => {
    const { d1, statements } = createRecordingD1();
    await insertSubmission(d1, submission('a'));
    statements.length = 0;
    expect(await getSubmission(d1, "x' OR '1'='1")).toBeNull();
    expect(statements[0]?.params).toEqual(["x' OR '1'='1"]);
    expect(
      await updateStatus(d1, "x' OR '1'='1", 'done', Date.now()),
    ).toBeFalse();
    expect((await getSubmission(d1, 'a'))?.status).toBe('new');
  });

  test('stores SQL-like input as plain text', async () => {
    const { d1, sqlite } = createRecordingD1();
    const name = "Robert'); DROP TABLE submissions; --";
    await insertSubmission(
      d1,
      submission('a', { fields: { f_name: name, f_message: name } }),
    );
    expect((await getSubmission(d1, 'a'))?.fields).toEqual({
      f_name: name,
      f_message: name,
    });
    expect(
      sqlite
        .query("SELECT name FROM sqlite_master WHERE name = 'submissions'")
        .get(),
    ).not.toBeNull();
  });

  test('the status check accepts exactly SUBMISSION_STATUSES', async () => {
    const { d1 } = createRecordingD1();
    for (const status of SUBMISSION_STATUSES) {
      await insertSubmission(d1, submission(status, { status }));
    }
    await expect(
      insertSubmission(
        d1,
        submission('bad', { status: 'archived' as SubmissionStatus }),
      ),
    ).rejects.toThrow();
  });

  test('leaving new sets read_at once', async () => {
    const { d1 } = createRecordingD1();
    await insertSubmission(d1, submission('a'));
    await updateStatus(d1, 'a', 'done', 1000);
    await updateStatus(d1, 'a', 'spam', 2000);
    expect((await getSubmission(d1, 'a'))?.readAt).toBe(1000);
    await updateStatus(d1, 'a', 'new', 3000);
    expect(await getSubmission(d1, 'a')).toMatchObject({
      status: 'new',
      readAt: 1000,
    });
  });
});

describe('list filters and sorting', () => {
  test('binds the JSON path and value of a choice filter', async () => {
    const { d1, statements } = createRecordingD1();
    await insertSubmission(d1, submission('a'));
    await insertSubmission(
      d1,
      submission('b', { fields: { f_category: 'press' } }),
    );
    statements.length = 0;
    const page = await listSubmissions(d1, {
      filter: { choice: { fieldId: 'f_category', value: 'press' } },
      limit: 10,
      offset: 0,
    });
    expect(page.items.map((item) => item.id)).toEqual(['b']);
    const [select] = statements;
    expect(select?.sql).toContain('json_extract("submissions"."fields", ?)');
    expect(select?.sql).not.toContain('f_category');
    expect(select?.sql).not.toContain('press');
    expect(select?.params).toContain('$.f_category');
    expect(select?.params).toContain('press');
  });

  test('a value with quotes stays a value', async () => {
    const { d1, statements } = createRecordingD1();
    await insertSubmission(d1, submission('a'));
    statements.length = 0;
    const value = "x') OR 1=1 --";
    const page = await listSubmissions(d1, {
      filter: { choice: { fieldId: 'f_category', value } },
      limit: 10,
      offset: 0,
    });
    expect(page).toEqual({ items: [], total: 0 });
    expect(statements[0]?.sql).not.toContain(value);
  });

  test.each(["f_x') OR 1=1 --", '$.f_name', 'f_name"', '__proto__', 'f_NAME'])(
    'refuses the field id %p before building SQL',
    async (fieldId) => {
      const { d1, statements } = createRecordingD1();
      statements.length = 0;
      await expect(
        listSubmissions(d1, {
          filter: { choice: { fieldId, value: 'sales' } },
          limit: 10,
          offset: 0,
        }),
      ).rejects.toThrow('invalid field id');
      expect(statements).toHaveLength(0);
    },
  );

  test('filters by form version', async () => {
    const { d1 } = createRecordingD1();
    await insertSubmission(d1, submission('a'));
    await insertSubmission(d1, submission('b', { formVersion: 2 }));
    const page = await listSubmissions(d1, {
      filter: { formVersion: 2 },
      limit: 10,
      offset: 0,
    });
    expect(page.items.map((item) => item.id)).toEqual(['b']);
  });

  test('sorts by a fixed column in either direction', async () => {
    const { d1 } = createRecordingD1();
    await insertSubmission(d1, submission('a', { email: 'b@example.org' }));
    await insertSubmission(
      d1,
      submission('b', { email: 'a@example.org', status: 'done' }),
    );
    const ids = async (sort: Parameters<typeof listSubmissions>[1]['sort']) =>
      (await listSubmissions(d1, { sort, limit: 10, offset: 0 })).items.map(
        (item) => item.id,
      );
    expect(await ids({ column: 'email', direction: 'asc' })).toEqual([
      'b',
      'a',
    ]);
    expect(await ids({ column: 'email', direction: 'desc' })).toEqual([
      'a',
      'b',
    ]);
    expect(await ids({ column: 'status', direction: 'asc' })).toEqual([
      'b',
      'a',
    ]);
  });

  test('reads only well-formed values from the fields JSON', async () => {
    const { d1, sqlite } = createRecordingD1();
    await insertSubmission(d1, submission('a'));
    sqlite.exec(
      `UPDATE submissions SET fields = '{"f_name":"Taro","bad key":"x","f_obj":{"a":1},"f_list":["a",1],"f_n":3}'`,
    );
    expect((await getSubmission(d1, 'a'))?.fields).toEqual({
      f_name: 'Taro',
      f_n: 3,
    });
  });
});

describe('submissionBatches', () => {
  const collect = async (
    batches: AsyncGenerator<{ id: string }[]>,
  ): Promise<string[][]> => {
    const out: string[][] = [];
    for await (const batch of batches) out.push(batch.map((s) => s.id));
    return out;
  };

  test('reads every row newest first in bounded queries', async () => {
    const { d1, statements } = createRecordingD1();
    // Rows 2 to 4 share a created_at, so the cursor has to break ties by id.
    const times = [1, 2, 2, 2, 3, 4, 5];
    for (const [i, time] of times.entries()) {
      await insertSubmission(
        d1,
        submission(`id${i}`, { createdAt: 1_700_000_000_000 + time }),
      );
    }
    statements.length = 0;
    const batches = await collect(submissionBatches(d1, {}, 3));
    expect(batches).toEqual([
      ['id6', 'id5', 'id4'],
      ['id3', 'id2', 'id1'],
      ['id0'],
    ]);
    expect(statements).toHaveLength(3);
    for (const statement of statements) {
      expect(statement.sql).toMatch(/ limit \?$/);
      expect(statement.params.at(-1)).toBe(3);
    }
  });

  test('filters by status and binds it', async () => {
    const { d1, statements } = createRecordingD1();
    await insertSubmission(d1, submission('a', { status: 'spam' }));
    await insertSubmission(d1, submission('b'));
    statements.length = 0;
    const batches = await collect(
      submissionBatches(d1, { status: INJECTION as SubmissionStatus }),
    );
    expect(batches).toEqual([]);
    expect(statements[0]?.sql).not.toContain(INJECTION);
    expect(await collect(submissionBatches(d1, { status: 'spam' }))).toEqual([
      ['a'],
    ]);
  });

  test('stops after a full last batch with one more empty query', async () => {
    const { d1, statements } = createRecordingD1();
    await insertSubmission(d1, submission('a'));
    await insertSubmission(d1, submission('b', { createdAt: 1 }));
    statements.length = 0;
    expect(await collect(submissionBatches(d1, {}, 2))).toEqual([['a', 'b']]);
    expect(statements).toHaveLength(2);
  });
});
