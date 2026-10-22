import type { D1Database } from '@cloudflare/workers-types';
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

interface SubmissionRow {
  id: string;
  created_at: number;
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
  category: string | null;
  body: string;
  status: SubmissionStatus;
  spam_score: number;
  spam_reasons: string | null;
  ip_hash: string | null;
  user_agent: string | null;
  country: string | null;
  page_path: string | null;
  consent_at: number;
  notified_at: number | null;
  read_at: number | null;
}

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

const fromRow = (row: SubmissionRow): Submission => ({
  id: row.id,
  createdAt: row.created_at,
  name: row.name,
  email: row.email,
  company: row.company,
  phone: row.phone,
  category: row.category,
  body: row.body,
  status: row.status,
  spamScore: row.spam_score,
  spamReasons: parseReasons(row.spam_reasons),
  ipHash: row.ip_hash,
  userAgent: row.user_agent,
  country: row.country,
  pagePath: row.page_path,
  consentAt: row.consent_at,
  notifiedAt: row.notified_at,
  readAt: row.read_at,
});

/** Inserts a submission. Throws when D1 rejects the write. */
export const insertSubmission = async (
  db: D1Database,
  s: NewSubmission,
): Promise<void> => {
  await db
    .prepare(
      `INSERT INTO submissions (id, created_at, name, email, company, phone,
        category, body, status, spam_score, spam_reasons, ip_hash, user_agent,
        country, page_path, consent_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)`,
    )
    .bind(
      s.id,
      s.createdAt,
      s.name,
      s.email,
      s.company,
      s.phone,
      s.category,
      s.body,
      s.status,
      s.spamScore,
      JSON.stringify(s.spamReasons),
      s.ipHash,
      s.userAgent,
      s.country,
      s.pagePath,
      s.consentAt,
    )
    .run();
};

/** Records that the Slack notification for a submission was delivered. */
export const markNotified = async (
  db: D1Database,
  id: string,
  now: number,
): Promise<void> => {
  await db
    .prepare('UPDATE submissions SET notified_at = ?1 WHERE id = ?2')
    .bind(now, id)
    .run();
};

/** One page of the admin list. */
export interface SubmissionPage {
  items: Submission[];
  total: number;
}

/**
 * Lists submissions, newest first.
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
  const where = status ? 'WHERE status = ?1' : '';
  const params = status ? [status] : [];
  const [rows, count] = await db.batch<SubmissionRow | { total: number }>([
    db
      .prepare(
        `SELECT * FROM submissions ${where}
        ORDER BY created_at DESC, id DESC LIMIT ${limit} OFFSET ${offset}`,
      )
      .bind(...params),
    db
      .prepare(`SELECT COUNT(*) AS total FROM submissions ${where}`)
      .bind(...params),
  ]);
  const total = (count?.results[0] as { total: number } | undefined)?.total;
  return {
    items: ((rows?.results ?? []) as SubmissionRow[]).map(fromRow),
    total: total ?? 0,
  };
};

/** Counts submissions with status `new`. */
export const countUnread = async (db: D1Database): Promise<number> =>
  (await db
    .prepare("SELECT COUNT(*) AS n FROM submissions WHERE status = 'new'")
    .first<number>('n')) ?? 0;

/** Returns one submission, or `null` when it does not exist. */
export const getSubmission = async (
  db: D1Database,
  id: string,
): Promise<Submission | null> => {
  const row = await db
    .prepare('SELECT * FROM submissions WHERE id = ?1')
    .bind(id)
    .first<SubmissionRow>();
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
  await db
    .prepare(
      "UPDATE submissions SET status = 'read', read_at = ?1 WHERE id = ?2 AND status = 'new'",
    )
    .bind(now, id)
    .run();
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
  const result = await db
    .prepare(
      `UPDATE submissions SET status = ?1,
        read_at = CASE WHEN ?1 != 'new' AND read_at IS NULL THEN ?2 ELSE read_at END
      WHERE id = ?3`,
    )
    .bind(status, now, id)
    .run();
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
  const result = await db
    .prepare('DELETE FROM submissions WHERE id = ?1')
    .bind(id)
    .run();
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
  const statement = status
    ? db
        .prepare(
          'SELECT * FROM submissions WHERE status = ?1 ORDER BY created_at DESC, id DESC',
        )
        .bind(status)
    : db.prepare('SELECT * FROM submissions ORDER BY created_at DESC, id DESC');
  const { results } = await statement.all<SubmissionRow>();
  return results.map(fromRow);
};
