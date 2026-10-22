import { Hono } from 'hono';
import packageJson from '../../../package.json' with { type: 'json' };
import type { HonoEnv } from '../../hono-env.ts';
import type { LocalizedLabel } from '../../options.ts';
import { apiError } from '../../shared/api-error.ts';
import { getContactAvailability } from '../contact/contact-availability.ts';
import { isSlackWebhookUrl } from '../notify/slack.ts';
import { getRetentionDays, pruneIfDue } from '../retention/prune.ts';
import {
  isSubmissionStatus,
  type SubmissionStatus,
} from '../submissions/submission-status.ts';
import {
  allSubmissions,
  countUnread,
  deleteSubmission,
  getSubmission,
  listSubmissions,
  markRead,
  updateStatus,
  type Submission,
} from '../submissions/submission-store.ts';
import { requireAdmin } from '../auth/require-admin.ts';
import { toCsv } from './csv.ts';

/** Submissions per page in the admin list. */
export const ADMIN_PAGE_SIZE = 50;

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
  /** Names of missing settings that keep the contact API closed. */
  contactMissing: string[];
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

const toAdminSubmission = ({ ipHash: _ipHash, ...rest }: Submission) => rest;

const statusFilter = (
  value: string | undefined,
): SubmissionStatus | undefined | false => {
  if (value === undefined || value === '' || value === 'all') return undefined;
  return isSubmissionStatus(value) ? value : false;
};

const isoDate = (ms: number) => new Date(ms).toISOString();

/**
 * Routes under `/api/admin`. Every route requires an admin session with a
 * passkey ({@link requireAdmin}).
 *
 * - `GET /me`: the signed-in admin.
 * - `GET /status`: {@link AdminStatus}.
 * - `GET /submissions?status=&page=`: {@link AdminSubmissionList}. Also runs
 *   retention pruning (throttled) in the background.
 * - `GET /submissions/:id`: one submission; marks a `new` one as read.
 * - `PATCH /submissions/:id` with `{ status }`: changes the status.
 * - `DELETE /submissions/:id`: deletes it.
 * - `GET /submissions.csv?status=`: CSV export.
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
    const [retentionDays, unreadCount] = await Promise.all([
      getRetentionDays(c.env.DB),
      countUnread(c.env.DB),
    ]);
    const status: AdminStatus = {
      version: packageJson.version,
      turnstileConfigured: contact.turnstileSecret && contact.turnstileSiteKey,
      contactAvailable: contact.available,
      contactMissing,
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
    const status = statusFilter(c.req.query('status'));
    if (status === false) return apiError(c, 400, 'invalid_input');
    const page = Number(c.req.query('page') ?? '1');
    if (!Number.isInteger(page) || page < 1 || page > 100_000) {
      return apiError(c, 400, 'invalid_input');
    }
    c.executionCtx.waitUntil(
      pruneIfDue(c.env.DB).catch((error: unknown) => {
        console.error(
          'prune failed:',
          error instanceof Error ? error.message : 'unknown error',
        );
      }),
    );
    const [{ items, total }, unreadCount] = await Promise.all([
      listSubmissions(c.env.DB, {
        status,
        limit: ADMIN_PAGE_SIZE,
        offset: (page - 1) * ADMIN_PAGE_SIZE,
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
      pageSize: ADMIN_PAGE_SIZE,
      total,
      unreadCount,
    };
    return c.json(body);
  })
  .get('/submissions.csv', async (c) => {
    const status = statusFilter(c.req.query('status'));
    if (status === false) return apiError(c, 400, 'invalid_input');
    const rows = await allSubmissions(c.env.DB, status);
    const csv = toCsv(
      [
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
      ],
      rows.map((s) => [
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
      ]),
    );
    const date = isoDate(Date.now()).slice(0, 10).replace(/-/g, '');
    return c.body(csv, 200, {
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
