import type { D1Database } from '@cloudflare/workers-types';
import {
  and,
  asc,
  count,
  desc,
  eq,
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
import type { SubmissionSort } from './submission-sort.ts';
import type { SubmissionStatus } from './submission-status.ts';

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

const statusIs = (status: SubmissionStatus | undefined) =>
  status ? eq(submissions.status, status) : undefined;

/**
 * Filters of the admin list and the CSV export. Every value has been
 * validated by the route; `choice.fieldId` was looked up in the current form
 * definition.
 */
export interface SubmissionFilter {
  /** Only this status, or every status when `undefined`. */
  status?: SubmissionStatus | undefined;
  /** Only this form version. */
  formVersion?: number | undefined;
  /** Only form versions up to and including this one. */
  maxFormVersion?: number | undefined;
  /** Only submissions whose select or radio field has this option value. */
  choice?: { fieldId: string; value: string } | undefined;
}

const filterWhere = ({
  status,
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
    statusIs(status),
    formVersion === undefined
      ? undefined
      : eq(submissions.formVersion, formVersion),
    maxFormVersion === undefined
      ? undefined
      : lte(submissions.formVersion, maxFormVersion),
    choiceIs,
  );
};

const SORT_COLUMNS = {
  received_at: submissions.createdAt,
  email: submissions.email,
  status: submissions.status,
} as const;

const orderBy = ({ column, direction }: SubmissionSort) => {
  const by = direction === 'asc' ? asc : desc;
  // Ties are broken by received time and id, so pages never overlap.
  return column === 'received_at'
    ? [by(submissions.createdAt), by(submissions.id)]
    : [
        by(SORT_COLUMNS[column]),
        desc(submissions.createdAt),
        desc(submissions.id),
      ];
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
 * Lists submissions. `limit` and `offset` are bound as parameters; the route
 * validates them as bounded integers. There is no keyword search.
 */
export const listSubmissions = async (
  db: D1Database,
  {
    filter = {},
    sort = { column: 'received_at', direction: 'desc' },
    limit,
    offset,
  }: {
    filter?: SubmissionFilter;
    sort?: SubmissionSort;
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
      .orderBy(...orderBy(sort))
      .limit(limit)
      .offset(offset),
    orm.select({ total: count() }).from(submissions).where(where),
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
