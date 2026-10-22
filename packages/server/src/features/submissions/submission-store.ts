import type { D1Database } from '@cloudflare/workers-types';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { getDatabase } from '../../db/database.ts';
import { submissions } from '../../db/schema.ts';
import type { SubmissionStatus } from './submission-status.ts';

/** A row of the `submissions` table, with camelCase names. */
export interface Submission {
  id: string;
  createdAt: number;
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
  category: string | null;
  body: string;
  status: SubmissionStatus;
  spamScore: number;
  spamReasons: string[];
  ipHash: string | null;
  userAgent: string | null;
  country: string | null;
  pagePath: string | null;
  consentAt: number;
  notifiedAt: number | null;
  readAt: number | null;
}

/** Values for a new row. `notifiedAt` and `readAt` start empty. */
export type NewSubmission = Omit<Submission, 'notifiedAt' | 'readAt'>;

type SubmissionRow = typeof submissions.$inferSelect;

const parseReasons = (value: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string')
      : [];
  } catch {
    return [];
  }
};

const fromRow = ({ spamReasons, ...row }: SubmissionRow): Submission => ({
  ...row,
  spamReasons: parseReasons(spamReasons),
});

const NEWEST_FIRST = [desc(submissions.createdAt), desc(submissions.id)];

const statusIs = (status: SubmissionStatus | undefined) =>
  status ? eq(submissions.status, status) : undefined;

/** Inserts a submission. Throws when D1 rejects the write. */
export const insertSubmission = async (
  db: D1Database,
  s: NewSubmission,
): Promise<void> => {
  await getDatabase(db)
    .insert(submissions)
    .values({ ...s, spamReasons: JSON.stringify(s.spamReasons) });
};

/** Records that the Slack notification for a submission was delivered. */
export const markNotified = async (
  db: D1Database,
  id: string,
  now: number,
): Promise<void> => {
  await getDatabase(db)
    .update(submissions)
    .set({ notifiedAt: now })
    .where(eq(submissions.id, id));
};

/** One page of the admin list. */
export interface SubmissionPage {
  items: Submission[];
  total: number;
}

/**
 * Lists submissions, newest first. `limit` and `offset` are bound as
 * parameters; the route validates them as bounded integers.
 *
 * @param status - Only this status, or every status when `undefined`.
 */
export const listSubmissions = async (
  db: D1Database,
  {
    status,
    limit,
    offset,
  }: {
    status: SubmissionStatus | undefined;
    limit: number;
    offset: number;
  },
): Promise<SubmissionPage> => {
  const orm = getDatabase(db);
  const [rows, [counted]] = await orm.batch([
    orm
      .select()
      .from(submissions)
      .where(statusIs(status))
      .orderBy(...NEWEST_FIRST)
      .limit(limit)
      .offset(offset),
    orm.select({ total: count() }).from(submissions).where(statusIs(status)),
  ]);
  return { items: rows.map(fromRow), total: counted?.total ?? 0 };
};

/** Counts submissions with status `new`. */
export const countUnread = async (db: D1Database): Promise<number> =>
  getDatabase(db).$count(submissions, eq(submissions.status, 'new'));

/** Returns one submission, or `null` when it does not exist. */
export const getSubmission = async (
  db: D1Database,
  id: string,
): Promise<Submission | null> => {
  const row = await getDatabase(db)
    .select()
    .from(submissions)
    .where(eq(submissions.id, id))
    .get();
  return row ? fromRow(row) : null;
};

/**
 * Marks a `new` submission as `read` and sets `read_at`. Other statuses are
 * left as they are.
 */
export const markRead = async (
  db: D1Database,
  id: string,
  now: number,
): Promise<void> => {
  await getDatabase(db)
    .update(submissions)
    .set({ status: 'read', readAt: now })
    .where(and(eq(submissions.id, id), eq(submissions.status, 'new')));
};

/**
 * Sets the status of a submission. Leaving `new` sets `read_at` if it is not
 * set yet.
 *
 * @returns `false` when the submission does not exist.
 */
export const updateStatus = async (
  db: D1Database,
  id: string,
  status: SubmissionStatus,
  now: number,
): Promise<boolean> => {
  const result = await getDatabase(db)
    .update(submissions)
    .set(
      status === 'new'
        ? { status }
        : { status, readAt: sql`coalesce(${submissions.readAt}, ${now})` },
    )
    .where(eq(submissions.id, id));
  return result.meta.changes > 0;
};

/**
 * Deletes a submission.
 *
 * @returns `false` when the submission does not exist.
 */
export const deleteSubmission = async (
  db: D1Database,
  id: string,
): Promise<boolean> => {
  const result = await getDatabase(db)
    .delete(submissions)
    .where(eq(submissions.id, id));
  return result.meta.changes > 0;
};

/**
 * Returns every submission, newest first, for the CSV export.
 *
 * @param status - Only this status, or every status when `undefined`.
 */
export const allSubmissions = async (
  db: D1Database,
  status: SubmissionStatus | undefined,
): Promise<Submission[]> => {
  const rows = await getDatabase(db)
    .select()
    .from(submissions)
    .where(statusIs(status))
    .orderBy(...NEWEST_FIRST);
  return rows.map(fromRow);
};
