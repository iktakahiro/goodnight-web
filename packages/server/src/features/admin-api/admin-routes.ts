import { Hono } from 'hono';
import packageJson from '../../../package.json' with { type: 'json' };
import type { HonoEnv } from '../../hono-env.ts';
import type { LocalizedLabel } from '../../options.ts';
import { apiError } from '../../shared/api-error.ts';
import { secretState } from '../../shared/secret-length.ts';
import { getContactAvailability } from '../contact/contact-availability.ts';
import { isSlackWebhookUrl } from '../notify/slack.ts';
import { getRetentionDays, pruneIfDue } from '../retention/prune.ts';
import { isSubmissionStatus } from '../submissions/submission-status.ts';
import {
  countUnread,
  deleteSubmission,
  getSubmission,
  listSubmissions,
  markRead,
  submissionBatches,
  updateStatus,
  type Submission,
} from '../submissions/submission-store.ts';
import { requireAdmin } from '../auth/require-admin.ts';
import { safeErrorMessage } from '../../shared/log-error.ts';
import { exportQuerySchema, listQuerySchema } from './admin-query.ts';
import { CSV_BOM, csvLine } from './csv.ts';

const EXCERPT_LENGTH = 120;

/** A submission as the admin API returns it. `ipHash` is never included. */
export type AdminSubmission = Omit<Submission, 'ipHash'>;

/** A list entry: no full body, only an excerpt. */
export type AdminSubmissionSummary = Pick<
  Submission,
  | 'id'
  | 'createdAt'
  | 'name'
  | 'email'
  | 'company'
  | 'category'
  | 'status'
  | 'spamScore'
> & { excerpt: string };

/** Body of `GET /api/admin/submissions`. */
export interface AdminSubmissionList {
  items: AdminSubmissionSummary[];
  page: number;
  pageSize: number;
  total: number;
  /** Submissions with status `new`, across all pages and filters. */
  unreadCount: number;
}

/**
 * A configured contact category. `label` is `null` when the category was
 * configured as a plain string; show `value` then.
 */
export interface AdminCategory {
  value: string;
  label: LocalizedLabel | null;
}

/** Body of `GET /api/admin/status`. Never contains secret values. */
export interface AdminStatus {
  version: string;
  /** `TURNSTILE_SECRET` and `TURNSTILE_SITE_KEY` are both set. */
  turnstileConfigured: boolean;
  /** The contact API accepts submissions (every required setting is set). */
  contactAvailable: boolean;
  /**
   * Names of missing settings that keep the contact API closed. A secret that
   * is set but too short is listed here and in `contactTooShort`.
   */
  contactMissing: string[];
  /**
   * Names of secrets that are set but shorter than `MIN_SECRET_LENGTH`
   * characters (`IP_HASH_SECRET`). The contact API stays closed until they
   * are replaced.
   */
  contactTooShort: string[];
  /** `SLACK_WEBHOOK_URL` is set to a Slack incoming webhook URL. */
  slackConfigured: boolean;
  retentionDays: number;
  unreadCount: number;
  /**
   * The `contact.categories` option in its configured order, empty when no
   * categories are configured.
   */
  categories: AdminCategory[];
}

const isoDate = (ms: number) => new Date(ms).toISOString();

const CSV_HEADER = [
  'id',
  'created_at',
  'status',
  'name',
  'email',
  'company',
  'phone',
  'category',
  'message',
  'page_path',
  'country',
  'spam_score',
  'spam_reasons',
] as const;

const csvRow = (s: Submission) => [
  s.id,
  isoDate(s.createdAt),
  s.status,
  s.name,
  s.email,
  s.company,
  s.phone,
  s.category,
  s.body,
  s.pagePath,
  s.country,
  s.spamScore,
  s.spamReasons.join(' '),
];

const toAdminSubmission = ({ ipHash: _ipHash, ...rest }: Submission) => rest;

/**
 * Routes under `/api/admin`. Every route requires an admin session with a
 * passkey ({@link requireAdmin}).
 *
 * - `GET /me`: the signed-in admin.
 * - `GET /status`: {@link AdminStatus}.
 * - `GET /submissions?status=&page=&limit=`: {@link AdminSubmissionList}
 *   (query rules in {@link listQuerySchema}; an invalid value is 400). Also runs
 *   retention pruning (throttled) in the background.
 * - `GET /submissions/:id`: one submission; marks a `new` one as read.
 * - `PATCH /submissions/:id` with `{ status }`: changes the status.
 * - `DELETE /submissions/:id`: deletes it.
 * - `GET /submissions.csv?status=`: CSV export, streamed in batches of
 *   rows.
 */
export const adminRoutes = new Hono<HonoEnv>()
  .use('*', requireAdmin)
  .get('/me', (c) => c.json(c.get('admin')))
  .get('/status', async (c) => {
    const contact = getContactAvailability(c.env);
    const contactMissing = [
      contact.turnstileSecret ? null : 'TURNSTILE_SECRET',
      contact.turnstileSiteKey ? null : 'TURNSTILE_SITE_KEY',
      contact.ipHashSecret ? null : 'IP_HASH_SECRET',
      contact.rateLimiter ? null : 'CONTACT_RATE_LIMITER',
    ].filter((name): name is string => name !== null);
    const contactTooShort =
      secretState(c.env.IP_HASH_SECRET) === 'too_short'
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
      categories: c
        .get('options')
        .contact.categoryLabels.map(({ value, label }) => ({ value, label })),
    };
    return c.json(status);
  })
  .get('/submissions', async (c) => {
    const query = listQuerySchema.safeParse(c.req.query());
    if (!query.success) return apiError(c, 400, 'invalid_input');
    const { status, page, limit } = query.data;
    c.executionCtx.waitUntil(
      pruneIfDue(c.env.DB).catch((error: unknown) => {
        console.error('prune failed:', safeErrorMessage(error));
      }),
    );
    const [{ items, total }, unreadCount] = await Promise.all([
      listSubmissions(c.env.DB, {
        status,
        limit,
        offset: (page - 1) * limit,
      }),
      countUnread(c.env.DB),
    ]);
    const body: AdminSubmissionList = {
      items: items.map((s) => ({
        id: s.id,
        createdAt: s.createdAt,
        name: s.name,
        email: s.email,
        company: s.company,
        category: s.category,
        status: s.status,
        spamScore: s.spamScore,
        excerpt: s.body.slice(0, EXCERPT_LENGTH),
      })),
      page,
      pageSize: limit,
      total,
      unreadCount,
    };
    return c.json(body);
  })
  .get('/submissions.csv', (c) => {
    const query = exportQuerySchema.safeParse(c.req.query());
    if (!query.success) return apiError(c, 400, 'invalid_input');
    const batches = submissionBatches(c.env.DB, query.data.status);
    const encoder = new TextEncoder();
    // Streamed one batch at a time, so a large table never sits in memory
    // as one string. A failed query ends the download with an error.
    const body = new ReadableStream<Uint8Array>({
      start: (controller) => {
        controller.enqueue(encoder.encode(CSV_BOM + csvLine(CSV_HEADER)));
      },
      pull: async (controller) => {
        try {
          const next = await batches.next();
          if (next.done) {
            controller.close();
            return;
          }
          controller.enqueue(
            encoder.encode(next.value.map(csvRow).map(csvLine).join('')),
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
    const id = c.req.param('id');
    const submission = await getSubmission(c.env.DB, id);
    if (!submission) return apiError(c, 404, 'not_found');
    if (submission.status === 'new') {
      const now = Date.now();
      await markRead(c.env.DB, id, now);
      submission.status = 'read';
      submission.readAt = now;
    }
    return c.json(toAdminSubmission(submission));
  })
  .patch('/submissions/:id', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return apiError(c, 400, 'invalid_json');
    }
    const status =
      typeof body === 'object' && body !== null
        ? (body as Record<string, unknown>).status
        : undefined;
    if (!isSubmissionStatus(status)) {
      return apiError(c, 400, 'invalid_input', { status: 'invalid' });
    }
    const id = c.req.param('id');
    if (!(await updateStatus(c.env.DB, id, status, Date.now()))) {
      return apiError(c, 404, 'not_found');
    }
    const submission = await getSubmission(c.env.DB, id);
    if (!submission) return apiError(c, 404, 'not_found');
    return c.json(toAdminSubmission(submission));
  })
  .delete('/submissions/:id', async (c) => {
    if (!(await deleteSubmission(c.env.DB, c.req.param('id')))) {
      return apiError(c, 404, 'not_found');
    }
    return c.json({ ok: true });
  });
