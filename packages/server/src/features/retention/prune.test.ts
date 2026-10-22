import { describe, expect, test } from 'bun:test';
import { createTestD1 } from '../../testing/sqlite-d1.ts';
import { insertSubmission } from '../submissions/submission-store.ts';
import { PRUNE_INTERVAL_MS, pruneIfDue } from './prune.ts';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 22);

const setup = async () => {
  const { d1, sqlite } = createTestD1();
  const add = (id: string, createdAt: number) =>
    insertSubmission(d1, {
      id,
      createdAt,
      name: 'n',
      email: 'e@example.org',
      company: null,
      phone: null,
      category: null,
      body: 'b',
      status: 'new',
      spamScore: 0,
      spamReasons: [],
      ipHash: null,
      userAgent: null,
      country: null,
      pagePath: null,
      consentAt: createdAt,
    });
  const ids = () =>
    (
      sqlite.query('SELECT id FROM submissions ORDER BY id').all() as {
        id: string;
      }[]
    ).map((r) => r.id);
  return { d1, sqlite, add, ids };
};

describe('pruneIfDue', () => {
  test('deletes rows older than 180 days by default', async () => {
    const { d1, add, ids } = await setup();
    await add('old', NOW - 180 * DAY - 1);
    await add('edge', NOW - 180 * DAY);
    await add('new', NOW - DAY);
    expect(await pruneIfDue(d1, NOW)).toEqual({
      ran: true,
      deleted: 1,
      retentionDays: 180,
    });
    expect(ids()).toEqual(['edge', 'new']);
  });

  test('runs at most once per hour', async () => {
    const { d1, add, ids } = await setup();
    expect((await pruneIfDue(d1, NOW)).ran).toBe(true);
    await add('old', NOW - 200 * DAY);
    expect(await pruneIfDue(d1, NOW + 1000)).toEqual({ ran: false });
    expect(await pruneIfDue(d1, NOW + PRUNE_INTERVAL_MS - 1)).toEqual({
      ran: false,
    });
    expect(ids()).toEqual(['old']);
    expect((await pruneIfDue(d1, NOW + PRUNE_INTERVAL_MS)).ran).toBe(true);
    expect(ids()).toEqual([]);
  });

  test('records last_cleanup_at', async () => {
    const { d1, sqlite } = await setup();
    await pruneIfDue(d1, NOW);
    expect(
      sqlite
        .query("SELECT value FROM settings WHERE key = 'last_cleanup_at'")
        .get(),
    ).toEqual({ value: String(NOW) });
  });

  test('uses settings.retention_days and ignores invalid values', async () => {
    const { d1, sqlite, add, ids } = await setup();
    sqlite.exec(
      "UPDATE settings SET value = '30' WHERE key = 'retention_days'",
    );
    await add('a', NOW - 31 * DAY);
    await add('b', NOW - 29 * DAY);
    expect(await pruneIfDue(d1, NOW)).toMatchObject({ retentionDays: 30 });
    expect(ids()).toEqual(['b']);
    sqlite.exec(
      "UPDATE settings SET value = 'abc' WHERE key = 'retention_days'",
    );
    expect(await pruneIfDue(d1, NOW + PRUNE_INTERVAL_MS)).toMatchObject({
      retentionDays: 180,
    });
  });

  test('works when the last_cleanup_at row is missing', async () => {
    const { d1, sqlite } = await setup();
    sqlite.exec("DELETE FROM settings WHERE key = 'last_cleanup_at'");
    expect((await pruneIfDue(d1, NOW)).ran).toBe(true);
    expect((await pruneIfDue(d1, NOW + 1)).ran).toBe(false);
  });
});
