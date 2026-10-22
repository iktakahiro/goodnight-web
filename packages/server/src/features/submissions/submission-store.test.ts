import { describe, expect, test } from 'bun:test';
import { createRecordingD1 } from '../../testing/recording-d1.ts';
import { testSubmission } from '../../testing/submissions.ts';
import {
  countSuspectedSpam,
  countUnread,
  escapeLike,
  getSubmission,
  insertSubmission,
  listSubmissions,
  markRead,
  submissionBatches,
  updateSubmission,
  type NewSubmission,
} from './submission-store.ts';
import {
  SUBMISSION_STATUSES,
  type SubmissionStatus,
} from './submission-status.ts';
import { SUBMISSION_VIEWS, type SubmissionView } from './submission-view.ts';

const INJECTION = "new' OR 1=1 --";

const submission = (id: string, overrides: Partial<NewSubmission> = {}) =>
  testSubmission(id, { createdAt: 1_700_000_000_000, ...overrides });

describe('submission store', () => {
  test('binds the email search, limit, and offset as parameters', async () => {
    const { d1, statements } = createRecordingD1();
    await insertSubmission(d1, submission('a'));
    statements.length = 0;
    const page = await listSubmissions(d1, {
      filter: { view: 'unread', email: INJECTION },
      limit: 7,
      offset: 3,
    });
    expect(page).toEqual({ items: [], total: 0 });
    const [select, total] = statements;
    expect(select?.sql).not.toContain(INJECTION);
    expect(select?.sql).toMatch(/ limit \? offset \?$/);
    expect(select?.sql).toContain(
      `lower("submissions"."email") like ? escape '\\'`,
    );
    const pattern = `%${INJECTION.toLowerCase()}%`;
    expect(select?.params).toEqual(['unread', 0, pattern, 7, 3]);
    expect(total?.sql).not.toContain(INJECTION.toLowerCase());
    expect(total?.params).toEqual(['unread', 0, pattern]);
  });

  test('uses the same SQL text for every search term and page', async () => {
    const { d1, statements } = createRecordingD1();
    const run = async (email: string, limit: number, offset: number) => {
      statements.length = 0;
      await listSubmissions(d1, {
        filter: { view: 'all', email },
        limit,
        offset,
      });
      return statements.map((s) => s.sql);
    };
    const texts = new Set<string>();
    for (const [email, limit, offset] of [
      ['taro', 50, 50],
      ['%_\\', 1, 99_950],
      [INJECTION, 100, 7],
    ] as const) {
      texts.add((await run(email, limit, offset)).join('\n'));
    }
    expect(texts.size).toBe(1);
    // Drizzle leaves out a zero offset; the limit is still bound.
    const [firstPage] = await run('taro', 50, 0);
    expect(firstPage).toMatch(/ limit \?$/);
    expect(statements[0]?.params.at(-1)).toBe(50);
  });

  test('refuses an unknown view before building SQL', async () => {
    const { d1, statements } = createRecordingD1();
    await expect(
      listSubmissions(d1, {
        filter: { view: INJECTION as SubmissionView },
        limit: 10,
        offset: 0,
      }),
    ).rejects.toThrow('invalid view');
    expect(statements).toHaveLength(0);
  });

  test('looks up an id as a value, not as SQL', async () => {
    const { d1, statements } = createRecordingD1();
    await insertSubmission(d1, submission('a'));
    statements.length = 0;
    expect(await getSubmission(d1, "x' OR '1'='1")).toBeNull();
    expect(statements[0]?.params).toEqual(["x' OR '1'='1"]);
    expect(
      await updateSubmission(
        d1,
        "x' OR '1'='1",
        { status: 'read', suspectedSpam: true },
        Date.now(),
      ),
    ).toBeFalse();
    expect(await getSubmission(d1, 'a')).toMatchObject({
      status: 'unread',
      suspectedSpam: false,
    });
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
    expect(SUBMISSION_STATUSES).toEqual(['unread', 'read']);
    for (const status of SUBMISSION_STATUSES) {
      await insertSubmission(d1, submission(status, { status }));
    }
    for (const status of ['new', 'done', 'held', 'spam']) {
      await expect(
        insertSubmission(
          d1,
          submission(status, { status: status as SubmissionStatus }),
        ),
      ).rejects.toThrow();
    }
  });

  test('read sets read_at once; unread clears it', async () => {
    const { d1 } = createRecordingD1();
    await insertSubmission(d1, submission('a'));
    await updateSubmission(d1, 'a', { status: 'read' }, 1000);
    await updateSubmission(d1, 'a', { status: 'read' }, 2000);
    expect(await getSubmission(d1, 'a')).toMatchObject({
      status: 'read',
      readAt: 1000,
    });
    await updateSubmission(d1, 'a', { status: 'unread' }, 3000);
    expect(await getSubmission(d1, 'a')).toMatchObject({
      status: 'unread',
      readAt: null,
    });
    await markRead(d1, 'a', 4000);
    expect(await getSubmission(d1, 'a')).toMatchObject({
      status: 'read',
      readAt: 4000,
    });
  });

  test('sets and clears the suspected spam flag without touching the status', async () => {
    const { d1 } = createRecordingD1();
    await insertSubmission(d1, submission('a'));
    expect(
      await updateSubmission(d1, 'a', { suspectedSpam: true }, 1000),
    ).toBeTrue();
    expect(await getSubmission(d1, 'a')).toMatchObject({
      status: 'unread',
      suspectedSpam: true,
      readAt: null,
    });
    await updateSubmission(d1, 'a', { suspectedSpam: false }, 2000);
    expect((await getSubmission(d1, 'a'))?.suspectedSpam).toBeFalse();
  });
});

describe('views and counts', () => {
  const seed = async () => {
    const { d1, statements } = createRecordingD1();
    await insertSubmission(d1, submission('unread', { createdAt: 4 }));
    await insertSubmission(
      d1,
      submission('read', { createdAt: 3, status: 'read' }),
    );
    await insertSubmission(
      d1,
      submission('spam-unread', { createdAt: 2, suspectedSpam: true }),
    );
    await insertSubmission(
      d1,
      submission('spam-read', {
        createdAt: 1,
        status: 'read',
        suspectedSpam: true,
      }),
    );
    return { d1, statements };
  };

  test.each([
    ['unread', ['unread']],
    ['read', ['read']],
    ['all', ['unread', 'read']],
    ['spam', ['spam-unread', 'spam-read']],
  ] as const)('the %p view lists %p', async (view, expected) => {
    const { d1 } = await seed();
    const page = await listSubmissions(d1, {
      filter: { view },
      limit: 10,
      offset: 0,
    });
    expect(page.items.map((item) => item.id)).toEqual([...expected]);
    expect(page.total).toBe(expected.length);
  });

  test('covers every view', () => {
    expect(SUBMISSION_VIEWS).toEqual(['unread', 'read', 'all', 'spam']);
  });

  test('counts unread without suspected spam, and all suspected spam', async () => {
    const { d1 } = await seed();
    expect(await countUnread(d1)).toBe(1);
    expect(await countSuspectedSpam(d1)).toBe(2);
  });
});

describe('email search', () => {
  const emails = [
    'Taro.Yamada@Example.ORG',
    'a_b@example.org',
    'axb@example.org',
    '100%@example.org',
    'back\\slash@example.org',
  ];
  const search = async (term: string) => {
    const { d1 } = createRecordingD1();
    for (const [i, email] of emails.entries()) {
      await insertSubmission(
        d1,
        submission(`id${i}`, { email, createdAt: 1_700_000_000_000 - i }),
      );
    }
    const page = await listSubmissions(d1, {
      filter: { view: 'all', email: term },
      limit: 10,
      offset: 0,
    });
    return page.items.map((item) => item.email);
  };

  test('matches part of the address, ignoring case', async () => {
    expect(await search('yamada@example')).toEqual(['Taro.Yamada@Example.ORG']);
    expect(await search('TARO')).toEqual(['Taro.Yamada@Example.ORG']);
    expect(await search('example.org')).toHaveLength(emails.length);
  });

  test('treats %, _, and \\ as plain characters', async () => {
    expect(await search('_')).toEqual(['a_b@example.org']);
    expect(await search('%')).toEqual(['100%@example.org']);
    expect(await search('\\')).toEqual(['back\\slash@example.org']);
    expect(await search('a%b')).toEqual([]);
  });

  test('escapeLike escapes the escape character too', () => {
    expect(escapeLike('a%b_c\\d')).toBe('a\\%b\\_c\\\\d');
    expect(escapeLike('plain@example.org')).toBe('plain@example.org');
  });
});

describe('list filters and order', () => {
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

  test('sorts by received time in either direction', async () => {
    const { d1 } = createRecordingD1();
    await insertSubmission(d1, submission('old', { createdAt: 1 }));
    await insertSubmission(d1, submission('new', { createdAt: 2 }));
    const ids = async (order?: 'asc' | 'desc') =>
      (
        await listSubmissions(d1, {
          ...(order ? { order } : {}),
          limit: 10,
          offset: 0,
        })
      ).items.map((item) => item.id);
    expect(await ids()).toEqual(['new', 'old']);
    expect(await ids('desc')).toEqual(['new', 'old']);
    expect(await ids('asc')).toEqual(['old', 'new']);
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

  test('filters by view and email search, with the search bound', async () => {
    const { d1, statements } = createRecordingD1();
    await insertSubmission(d1, submission('a', { suspectedSpam: true }));
    await insertSubmission(d1, submission('b'));
    statements.length = 0;
    const batches = await collect(
      submissionBatches(d1, { view: 'all', email: INJECTION }),
    );
    expect(batches).toEqual([]);
    expect(statements[0]?.sql).not.toContain(INJECTION.toLowerCase());
    expect(await collect(submissionBatches(d1, { view: 'spam' }))).toEqual([
      ['a'],
    ]);
    expect(
      await collect(submissionBatches(d1, { view: 'all', email: 'B@EX' })),
    ).toEqual([['b']]);
  });

  test('leaves out form versions above maxFormVersion and binds it', async () => {
    const { d1, statements } = createRecordingD1();
    await insertSubmission(d1, submission('v1', { formVersion: 1 }));
    await insertSubmission(d1, submission('v2', { formVersion: 2 }));
    await insertSubmission(d1, submission('v3', { formVersion: 3 }));
    statements.length = 0;
    const batches = await collect(submissionBatches(d1, { maxFormVersion: 2 }));
    expect(batches.flat().sort()).toEqual(['v1', 'v2']);
    expect(statements[0]?.sql).toContain('"form_version" <= ?');
    expect(statements[0]?.params).toContain(2);
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
