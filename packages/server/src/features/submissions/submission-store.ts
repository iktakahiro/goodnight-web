import type { D1Database } from '@cloudflare/workers-types';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  like,
  lt,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { getDatabase } from '../../db/database.ts';
import { submissions } from '../../db/schema.ts';
import { isFieldId } from '../contact-form/form-definition.ts';
import type {
  FieldValue,
  FieldValues,
} from '../contact-form/form-values-schema.ts';
import type { Locale } from '../../shared/messages.ts';
import type { SubmissionStatus } from './submission-status.ts';
import type { SubmissionOrder, SubmissionView } from './submission-view.ts';

/** A row of the `submissions` table, with camelCase names. */
export interface Submission {
  id: string;
  createdAt: number;
  email: string;
  /** Values of the form fields, keyed by field id. */
  fields: FieldValues;
  /** The form version the values were validated against. */
  formVersion: number;
  /** Language of the page that sent the form, when known. */
  locale: Locale | null;
  status: SubmissionStatus;
  /** Flagged by the honeypot or the spam score, or by an admin. */
  suspectedSpam: boolean;
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

const isFieldValue = (value: unknown): value is FieldValue =>
  typeof value === 'string' ||
  (typeof value === 'number' && Number.isFinite(value)) ||
  (Array.isArray(value) && value.every((entry) => typeof entry === 'string'));

/** Narrows the stored `fields` JSON: field ids with well-formed values. */
const parseFieldValues = (value: unknown): FieldValues => {
  const values: FieldValues = {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return values;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (isFieldId(key) && isFieldValue(entry)) values[key] = entry;
  }
  return values;
};

const fromRow = ({
  spamReasons,
  fields,
  locale,
  ...row
}: SubmissionRow): Submission => ({
  ...row,
  fields: parseFieldValues(fields),
  locale: locale === 'ja' || locale === 'en' ? locale : null,
  spamReasons: parseReasons(spamReasons),
});

const NEWEST_FIRST = [desc(submissions.createdAt), desc(submissions.id)];

const viewIs = (view: SubmissionView | undefined): SQL | undefined => {
  switch (view) {
    case 'unread':
    case 'read':
      return and(
        eq(submissions.status, view),
        eq(submissions.suspectedSpam, false),
      );
    case 'all':
      return eq(submissions.suspectedSpam, false);
    case 'spam':
      return eq(submissions.suspectedSpam, true);
    case undefined:
      return undefined;
    default:
      throw new Error('invalid view');
  }
};

/**
 * Escapes `%`, `_`, and `\` for a `LIKE` pattern with `ESCAPE '\'`, so the
 * term matches as plain text.
 */
export const escapeLike = (term: string): string =>
  term.replace(/[\\%_]/g, (char) => `\\${char}`);

/**
 * Case-insensitive partial match on `email`. The pattern is one bound
 * parameter; only the `ESCAPE` character is part of the SQL text.
 */
const emailContains = (term: string): SQL =>
  sql`${like(
    sql`lower(${submissions.email})`,
    `%${escapeLike(term.toLowerCase())}%`,
  )} escape '\\'`;

/**
 * Filters of the admin list and the CSV export. Every value has been
 * validated by the route; `choice.fieldId` was looked up in the current form
 * definition.
 */
export interface SubmissionFilter {
  /**
   * One view of the list ({@link SubmissionView}). `undefined` means every
   * submission, suspected spam included (used by tests and tools only).
   */
  view?: SubmissionView | undefined;
  /** Only submissions whose email contains this text, ignoring case. */
  email?: string | undefined;
  /** Only this form version. */
  formVersion?: number | undefined;
  /** Only form versions up to and including this one. */
  maxFormVersion?: number | undefined;
  /** Only submissions whose select or radio field has this option value. */
  choice?: { fieldId: string; value: string } | undefined;
}

const filterWhere = ({
  view,
  email,
  formVersion,
  maxFormVersion,
  choice,
}: SubmissionFilter) => {
  let choiceIs: SQL | undefined;
  if (choice) {
    // Defense in depth: the route already took the id from the definition.
    // The JSON path and the value are bound parameters either way.
    if (!isFieldId(choice.fieldId)) throw new Error('invalid field id');
    choiceIs = sql`json_extract(${submissions.fields}, ${`$.${choice.fieldId}`}) = ${choice.value}`;
  }
  return and(
    viewIs(view),
    email ? emailContains(email) : undefined,
    formVersion === undefined
      ? undefined
      : eq(submissions.formVersion, formVersion),
    maxFormVersion === undefined
      ? undefined
      : lte(submissions.formVersion, maxFormVersion),
    choiceIs,
  );
};

// Ties on received time are broken by id, so pages never overlap.
const orderBy = (order: SubmissionOrder) => {
  const by = order === 'asc' ? asc : desc;
  return [by(submissions.createdAt), by(submissions.id)];
};

/**
 * Counts the submissions stored at or after `since` (unix ms), suspected
 * spam included. Uses the `created_at` index.
 */
export const countSubmissionsSince = async (
  db: D1Database,
  since: number,
): Promise<number> => {
  const [row] = await getDatabase(db)
    .select({ total: count() })
    .from(submissions)
    .where(gte(submissions.createdAt, since));
  return row?.total ?? 0;
};

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
 * Lists submissions by received time (`order`, newest first by default).
 * `limit` and `offset` are bound as parameters; the route validates them as
 * bounded integers.
 */
export const listSubmissions = async (
  db: D1Database,
  {
    filter = {},
    order = 'desc',
    limit,
    offset,
  }: {
    filter?: SubmissionFilter;
    order?: SubmissionOrder;
    limit: number;
    offset: number;
  },
): Promise<SubmissionPage> => {
  const orm = getDatabase(db);
  const where = filterWhere(filter);
  const [rows, [counted]] = await orm.batch([
    orm
      .select()
      .from(submissions)
      .where(where)
      .orderBy(...orderBy(order))
      .limit(limit)
      .offset(offset),
    orm.select({ total: count() }).from(submissions).where(where),
  ]);
  return { items: rows.map(fromRow), total: counted?.total ?? 0 };
};

/** Counts unread submissions that are not suspected spam. */
export const countUnread = async (db: D1Database): Promise<number> =>
  getDatabase(db).$count(submissions, viewIs('unread'));

/** Counts suspected spam, read or unread. */
export const countSuspectedSpam = async (db: D1Database): Promise<number> =>
  getDatabase(db).$count(submissions, viewIs('spam'));

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
 * Marks an `unread` submission as `read` and sets `read_at`. A submission
 * that is already read keeps its `read_at`.
 *
 * @returns The submission as stored after the update, or `null` when it does
 *   not exist.
 */
export const markRead = async (
  db: D1Database,
  id: string,
  now: number,
): Promise<Submission | null> => {
  const [updated] = await getDatabase(db)
    .update(submissions)
    .set({ status: 'read', readAt: now })
    .where(and(eq(submissions.id, id), eq(submissions.status, 'unread')))
    .returning();
  // No row changed: it was already read (or another request read it first),
  // or it is gone.
  return updated ? fromRow(updated) : getSubmission(db, id);
};

/** Changes an admin can make to a submission. Leave out what stays. */
export interface SubmissionUpdate {
  status?: SubmissionStatus | undefined;
  suspectedSpam?: boolean | undefined;
}

/**
 * Updates the status or the suspected spam flag of a submission. `read`
 * sets `read_at` if it is not set yet; `unread` clears it.
 *
 * @returns `false` when the submission does not exist.
 */
export const updateSubmission = async (
  db: D1Database,
  id: string,
  { status, suspectedSpam }: SubmissionUpdate,
  now: number,
): Promise<boolean> => {
  const result = await getDatabase(db)
    .update(submissions)
    .set({
      ...(status === 'unread' ? { status, readAt: null } : {}),
      ...(status === 'read'
        ? { status, readAt: sql`coalesce(${submissions.readAt}, ${now})` }
        : {}),
      ...(suspectedSpam === undefined ? {} : { suspectedSpam }),
    })
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

/** Rows per query in {@link submissionBatches}. */
export const EXPORT_BATCH_SIZE = 200;

/**
 * Yields every submission that matches `filter`, newest first, in batches of
 * at most `batchSize` rows, for the CSV export. Each batch is one query that
 * continues after the last row of the previous batch (keyset pagination on
 * `created_at`, `id`), so memory use and the size of each D1 result stay
 * bounded however large the table is.
 */
export async function* submissionBatches(
  db: D1Database,
  filter: SubmissionFilter = {},
  batchSize: number = EXPORT_BATCH_SIZE,
): AsyncGenerator<Submission[]> {
  const orm = getDatabase(db);
  let after: { createdAt: number; id: string } | null = null;
  for (;;) {
    const rows = await orm
      .select()
      .from(submissions)
      .where(
        and(
          filterWhere(filter),
          after
            ? or(
                lt(submissions.createdAt, after.createdAt),
                and(
                  eq(submissions.createdAt, after.createdAt),
                  lt(submissions.id, after.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(...NEWEST_FIRST)
      .limit(batchSize);
    if (rows.length > 0) yield rows.map(fromRow);
    const last = rows.at(-1);
    if (!last || rows.length < batchSize) return;
    after = { createdAt: last.createdAt, id: last.id };
  }
}
