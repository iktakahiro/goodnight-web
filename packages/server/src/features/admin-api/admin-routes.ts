import { Hono, type Context } from 'hono';
import * as z from 'zod';
import packageJson from '../../../package.json' with { type: 'json' };
import type { HonoEnv } from '../../hono-env.ts';
import { apiError } from '../../shared/api-error.ts';
import { isJsonContentType, readBodyWithLimit } from '../../shared/request.ts';
import { secretState } from '../../shared/secret-length.ts';
import { getContactAvailability } from '../contact/contact-availability.ts';
import {
  type FormField,
  type FormFieldType,
  type LocalizedText,
} from '../contact-form/form-definition.ts';
import { formAdminRoutes } from '../contact-form/form-admin-routes.ts';
import {
  getCurrentForm,
  getFormVersion,
  getFormVersions,
} from '../contact-form/form-store.ts';
import { isSlackWebhookUrl } from '../notify/slack.ts';
import { getRetentionDays, pruneIfDue } from '../retention/prune.ts';
import { SUBMISSION_STATUSES } from '../submissions/submission-status.ts';
import {
  countSuspectedSpam,
  countUnread,
  deleteSubmission,
  getSubmission,
  listSubmissions,
  markRead,
  submissionBatches,
  updateSubmission,
  type Submission,
  type SubmissionFilter,
} from '../submissions/submission-store.ts';
import { requireAdmin } from '../auth/require-admin.ts';
import { safeErrorMessage } from '../../shared/log-error.ts';
import { exportQuerySchema, listQuerySchema } from './admin-query.ts';
import {
  detailEntries,
  LIST_TEXT_LENGTH,
  toAdminValue,
  type AdminFieldEntry,
  type AdminFieldValue,
} from './admin-view.ts';
import { CSV_BOM, csvLine } from './csv.ts';
import { csvLayout, csvRow } from './csv-export.ts';

/**
 * A submission as the admin API returns it. `ipHash` and the raw `fields`
 * are never included; `entries` holds the field values with the labels of
 * the submission's own form version.
 */
export type AdminSubmission = Omit<Submission, 'ipHash' | 'fields'> & {
  entries: AdminFieldEntry[];
  /** The current form version, to tell old submissions apart. */
  currentFormVersion: number;
};

/**
 * A list entry: the fixed columns and the values of the current form's
 * fields, with long text cut to 120 characters. Values of fields that are
 * not on the current form are left out.
 */
export type AdminSubmissionSummary = Pick<
  Submission,
  | 'id'
  | 'createdAt'
  | 'email'
  | 'status'
  | 'suspectedSpam'
  | 'spamScore'
  | 'formVersion'
> & { fields: Record<string, AdminFieldValue> };

/** A column of the admin list: a field of the current form. */
export interface AdminListColumn {
  id: string;
  type: FormFieldType;
  label: LocalizedText;
  /** Shown by default; the admin can hide or show columns in the browser. */
  showInList: boolean;
  /** Options of select and radio fields, which can be filtered on. */
  options?: { value: string; label: LocalizedText }[];
}

/** Body of `GET /api/admin/submissions`. */
export interface AdminSubmissionList {
  items: AdminSubmissionSummary[];
  /** The current form's fields, in form order. */
  columns: AdminListColumn[];
  /** The current form version. */
  formVersion: number;
  page: number;
  pageSize: number;
  total: number;
  /**
   * Unread submissions that are not suspected spam, across all pages and
   * filters.
   */
  unreadCount: number;
  /** Suspected spam, read or unread, across all pages and filters. */
  suspectedSpamCount: number;
}

/**
 * Body of `PATCH /api/admin/submissions/:id`: the new status, the suspected
 * spam flag, or both. At least one is required; other keys are rejected.
 */
export const submissionUpdateSchema = z
  .strictObject({
    status: z.enum(SUBMISSION_STATUSES).optional(),
    suspectedSpam: z.boolean().optional(),
  })
  .refine(
    (update) =>
      update.status !== undefined || update.suspectedSpam !== undefined,
  );

/**
 * Largest accepted body of `PATCH /api/admin/submissions/:id`, in bytes. The
 * update holds two small values.
 */
export const SUBMISSION_UPDATE_MAX_BODY_BYTES = 4 * 1024;

/** Body of `GET /api/admin/status`. Never contains secret values. */
export interface AdminStatus {
  version: string;
  /** `TURNSTILE_SECRET` and `TURNSTILE_SITE_KEY` are both set. */
  turnstileConfigured: boolean;
  /** The contact API accepts submissions (every required setting is set). */
  contactAvailable: boolean;
  /**
   * Names of missing settings that keep the contact API closed. A secret that
   * is set but too short or weak is listed here and in `contactTooShort`.
   */
  contactMissing: string[];
  /**
   * Names of secrets that are set but shorter than `MIN_SECRET_LENGTH`
   * characters or weak (`IP_HASH_SECRET`; see `secretState`). The contact
   * API stays closed until they are replaced.
   */
  contactTooShort: string[];
  /** `SLACK_WEBHOOK_URL` is set to a Slack incoming webhook URL. */
  slackConfigured: boolean;
  retentionDays: number;
  unreadCount: number;
}

const isoDate = (ms: number) => new Date(ms).toISOString();

const toAdminSubmission = async (
  c: Context<HonoEnv>,
  submission: Submission,
): Promise<AdminSubmission> => {
  const { ipHash: _ipHash, fields: _fields, ...rest } = submission;
  const [current, own] = await Promise.all([
    getCurrentForm(c.env.DB),
    getFormVersion(c.env.DB, submission.formVersion),
  ]);
  return {
    ...rest,
    entries: detailEntries(
      submission,
      own?.definition ?? null,
      current.definition,
    ),
    currentFormVersion: current.version,
  };
};

const listColumn = (field: FormField): AdminListColumn => ({
  id: field.id,
  type: field.type,
  label: field.label,
  showInList: field.showInList,
  ...(field.type === 'select' || field.type === 'radio'
    ? { options: field.options ?? [] }
    : {}),
});

/**
 * Turns the `field` and `value` query parameters into a filter. The field
 * must be a select or radio field of the current form and the value one of
 * its options, so the JSON path is always an id from the definition.
 *
 * @returns `null` when the field or value is not allowed.
 */
const choiceFilter = (
  fields: readonly FormField[],
  query: { field?: string | undefined; value?: string | undefined },
): SubmissionFilter['choice'] | null => {
  if (query.field === undefined || query.value === undefined) return undefined;
  const field = fields.find(
    (entry) =>
      entry.id === query.field &&
      (entry.type === 'select' || entry.type === 'radio'),
  );
  if (!field?.options?.some((option) => option.value === query.value)) {
    return null;
  }
  return { fieldId: field.id, value: query.value };
};

/**
 * Routes under `/api/admin`. Every route requires an admin session with a
 * passkey ({@link requireAdmin}).
 *
 * - `GET /me`: the signed-in admin.
 * - `GET /status`: {@link AdminStatus}.
 * - `GET /submissions?view=&q=&version=&field=&value=&dir=&page=&limit=`:
 *   {@link AdminSubmissionList} (query rules in {@link listQuerySchema}; an
 *   invalid or unknown parameter is 400). Sorted by received time only;
 *   `q` searches the email address only. Also runs retention pruning
 *   (throttled) in the background.
 * - `GET /submissions/:id`: one submission. It changes nothing.
 * - `POST /submissions/:id/read` (no body): marks an unread submission as
 *   read, keeping an earlier `read_at`, and returns it. The admin UI calls
 *   it when it opens an unread inquiry, so a GET (which skips the Origin
 *   check) never changes state.
 * - `PATCH /submissions/:id` with {@link submissionUpdateSchema}: sets the
 *   status (`unread` or `read`) or the suspected spam flag. The body must be
 *   `application/json` (415) and at most
 *   {@link SUBMISSION_UPDATE_MAX_BODY_BYTES} (413).
 * - `DELETE /submissions/:id`: deletes it.
 * - `GET /submissions.csv?view=&q=&version=&field=&value=&lang=`: CSV
 *   export of the same filters, streamed in batches of rows.
 * - `/form/*`: the contact form definition ({@link formAdminRoutes}).
 */
export const adminRoutes = new Hono<HonoEnv>()
  .use('*', requireAdmin)
  .route('/form', formAdminRoutes)
  .get('/me', (c) => c.json(c.get('admin')))
  .get('/status', async (c) => {
    const contact = getContactAvailability(c.env);
    const contactMissing = [
      contact.turnstileSecret ? null : 'TURNSTILE_SECRET',
      contact.turnstileSiteKey ? null : 'TURNSTILE_SITE_KEY',
      contact.ipHashSecret ? null : 'IP_HASH_SECRET',
      contact.rateLimiter ? null : 'CONTACT_RATE_LIMITER',
    ].filter((name): name is string => name !== null);
    const contactTooShort = ['too_short', 'weak'].includes(
      secretState(c.env.IP_HASH_SECRET),
    )
      ? ['IP_HASH_SECRET']
      : [];
    const [retentionDays, unreadCount] = await Promise.all([
      getRetentionDays(c.env.DB),
      countUnread(c.env.DB),
    ]);
    const status: AdminStatus = {
      version: packageJson.version,
      turnstileConfigured: contact.turnstileSecret && contact.turnstileSiteKey,
      contactAvailable: contact.available,
      contactMissing,
      contactTooShort,
      slackConfigured: isSlackWebhookUrl(c.env.SLACK_WEBHOOK_URL),
      retentionDays,
      unreadCount,
    };
    return c.json(status);
  })
  .get('/submissions', async (c) => {
    const query = listQuerySchema.safeParse(c.req.query());
    if (!query.success) return apiError(c, 400, 'invalid_input');
    const { view, q, version, page, limit, dir } = query.data;
    const current = await getCurrentForm(c.env.DB);
    const choice = choiceFilter(current.definition.fields, query.data);
    if (choice === null) {
      return apiError(c, 400, 'invalid_input', { field: 'invalid' });
    }
    c.executionCtx.waitUntil(
      pruneIfDue(c.env.DB).catch((error: unknown) => {
        console.error('prune failed:', safeErrorMessage(error));
      }),
    );
    const [{ items, total }, unreadCount, suspectedSpamCount] =
      await Promise.all([
        listSubmissions(c.env.DB, {
          filter: { view, email: q, formVersion: version, choice },
          order: dir,
          limit,
          offset: (page - 1) * limit,
        }),
        countUnread(c.env.DB),
        countSuspectedSpam(c.env.DB),
      ]);
    // Option labels come from each row's own version.
    const versions = await getFormVersions(
      c.env.DB,
      items.map((item) => item.formVersion),
    );
    const columns = current.definition.fields;
    const body: AdminSubmissionList = {
      items: items.map((s) => {
        const own = versions.get(s.formVersion)?.definition.fields ?? [];
        const fields: Record<string, AdminFieldValue> = {};
        for (const column of columns) {
          const value = s.fields[column.id];
          if (value === undefined) continue;
          fields[column.id] = toAdminValue(
            own.find((field) => field.id === column.id) ?? column,
            value,
            LIST_TEXT_LENGTH,
          );
        }
        return {
          id: s.id,
          createdAt: s.createdAt,
          email: s.email,
          status: s.status,
          suspectedSpam: s.suspectedSpam,
          spamScore: s.spamScore,
          formVersion: s.formVersion,
          fields,
        };
      }),
      columns: columns.map(listColumn),
      formVersion: current.version,
      page,
      pageSize: limit,
      total,
      unreadCount,
      suspectedSpamCount,
    };
    return c.json(body);
  })
  .get('/submissions.csv', async (c) => {
    const query = exportQuerySchema.safeParse(c.req.query());
    if (!query.success) return apiError(c, 400, 'invalid_input');
    const current = await getCurrentForm(c.env.DB);
    const choice = choiceFilter(current.definition.fields, query.data);
    if (choice === null) {
      return apiError(c, 400, 'invalid_input', { field: 'invalid' });
    }
    const locale = query.data.lang ?? c.get('options').locale;
    const layout = csvLayout(current.definition, locale);
    // The header comes from this version, so rows sent with a version saved
    // during the export (and its new fields) are left for the next export.
    const batches = submissionBatches(c.env.DB, {
      view: query.data.view,
      email: query.data.q,
      formVersion: query.data.version,
      maxFormVersion: current.version,
      choice,
    });
    const db = c.env.DB;
    const encoder = new TextEncoder();
    // Streamed one batch at a time, so a large table never sits in memory
    // as one string. A failed query ends the download with an error.
    const body = new ReadableStream<Uint8Array>({
      start: (controller) => {
        controller.enqueue(encoder.encode(CSV_BOM + csvLine(layout.header)));
      },
      pull: async (controller) => {
        try {
          const next = await batches.next();
          if (next.done) {
            controller.close();
            return;
          }
          const versions = await getFormVersions(
            db,
            next.value.map((s) => s.formVersion),
          );
          controller.enqueue(
            encoder.encode(
              next.value
                .map((s) => csvLine(csvRow(s, layout, versions, locale)))
                .join(''),
            ),
          );
        } catch (error) {
          console.error('csv export failed:', safeErrorMessage(error));
          controller.error(error);
        }
      },
      cancel: async () => {
        await batches.return(undefined);
      },
    });
    const date = isoDate(Date.now()).slice(0, 10).replace(/-/g, '');
    return c.body(body, 200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="inquiries-${date}.csv"`,
    });
  })
  .get('/submissions/:id', async (c) => {
    const submission = await getSubmission(c.env.DB, c.req.param('id'));
    if (!submission) return apiError(c, 404, 'not_found');
    return c.json(await toAdminSubmission(c, submission));
  })
  .post('/submissions/:id/read', async (c) => {
    const submission = await markRead(c.env.DB, c.req.param('id'), Date.now());
    if (!submission) return apiError(c, 404, 'not_found');
    return c.json(await toAdminSubmission(c, submission));
  })
  .patch('/submissions/:id', async (c) => {
    if (!isJsonContentType(c.req.header('content-type'))) {
      return apiError(c, 415, 'unsupported_media_type');
    }
    const text = await readBodyWithLimit(
      c.req.raw,
      SUBMISSION_UPDATE_MAX_BODY_BYTES,
    );
    if (text === null) return apiError(c, 413, 'payload_too_large');
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return apiError(c, 400, 'invalid_json');
    }
    const update = submissionUpdateSchema.safeParse(body);
    if (!update.success) return apiError(c, 400, 'invalid_input');
    const id = c.req.param('id');
    if (!(await updateSubmission(c.env.DB, id, update.data, Date.now()))) {
      return apiError(c, 404, 'not_found');
    }
    const submission = await getSubmission(c.env.DB, id);
    if (!submission) return apiError(c, 404, 'not_found');
    return c.json(await toAdminSubmission(c, submission));
  })
  .delete('/submissions/:id', async (c) => {
    if (!(await deleteSubmission(c.env.DB, c.req.param('id')))) {
      return apiError(c, 404, 'not_found');
    }
    return c.json({ ok: true });
  });
