import { describe, expect, test } from 'bun:test';
import { createRecordingD1 } from '../../testing/recording-d1.ts';
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

const submission = (id: string, overrides: Partial<NewSubmission> = {}) => ({
  id,
  createdAt: 1_700_000_000_000,
  name: 'Taro',
  email: `${id}@example.org`,
  company: null,
  phone: null,
  category: 'sales',
  body: 'Hello',
  status: 'new' as const,
  spamScore: 0,
  spamReasons: [],
  ipHash: 'hash',
  userAgent: null,
  country: 'JP',
  pagePath: '/contact',
  consentAt: 1_700_000_000_000,
  ...overrides,
});

describe('submission store', () => {
  test('binds the status, limit, and offset as parameters', async () => {
    const { d1, statements } = createRecordingD1();
    await insertSubmission(d1, submission('a'));
    statements.length = 0;
    const page = await listSubmissions(d1, {
      status: INJECTION as SubmissionStatus,
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
        status: status as SubmissionStatus,
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
    await insertSubmission(d1, submission('a', { name }));
    expect((await getSubmission(d1, 'a'))?.name).toBe(name);
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
    const batches = await collect(submissionBatches(d1, undefined, 3));
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
      submissionBatches(d1, INJECTION as SubmissionStatus),
    );
    expect(batches).toEqual([]);
    expect(statements[0]?.sql).not.toContain(INJECTION);
    expect(await collect(submissionBatches(d1, 'spam'))).toEqual([['a']]);
  });

  test('stops after a full last batch with one more empty query', async () => {
    const { d1, statements } = createRecordingD1();
    await insertSubmission(d1, submission('a'));
    await insertSubmission(d1, submission('b', { createdAt: 1 }));
    statements.length = 0;
    expect(await collect(submissionBatches(d1, undefined, 2))).toEqual([
      ['a', 'b'],
    ]);
    expect(statements).toHaveLength(2);
  });
});
