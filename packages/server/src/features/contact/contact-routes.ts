import { Hono, type Context } from 'hono';
import type { HonoEnv } from '../../hono-env.ts';
import { apiError } from '../../shared/api-error.ts';
import { hmacSha256Hex } from '../../shared/crypto.ts';
import { isAllowedOrigin, readBodyWithLimit } from '../../shared/request.ts';
import { ulid } from '../../shared/ulid.ts';
import {
  buildSlackPayload,
  isSlackWebhookUrl,
  sendSlackNotification,
} from '../notify/slack.ts';
import { pruneIfDue } from '../retention/prune.ts';
import { insertSubmission } from '../submissions/submission-store.ts';
import type { SubmissionStatus } from '../submissions/submission-status.ts';
import { getContactAvailability } from './contact-availability.ts';
import {
  CONTACT_HONEYPOT_FIELD,
  CONTACT_MAX_BODY_BYTES,
  CONTACT_TURNSTILE_ACTION,
  contactFieldErrors,
  contactRequestSchema,
} from './contact-schema.ts';
import { SPAM_HOLD_THRESHOLD, scoreSubmission } from './spam-score.ts';
import { verifyTurnstile } from './turnstile.ts';
import { safeErrorMessage } from '../../shared/log-error.ts';

/** Body of `GET /api/contact/config`, read by the contact form. */
export interface ContactConfig {
  /** `false` when the contact API answers 503 (a setting is missing). */
  available: boolean;
  /** Public Turnstile site key, or `null` when not available. */
  turnstileSiteKey: string | null;
  turnstileAction: string;
  honeypotField: string;
  /** Allowed categories, or `null` when any value is accepted. */
  categories: readonly string[] | null;
}

const USER_AGENT_MAX = 500;

const text = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null;
  // oxlint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').trim();
  return cleaned === '' ? null : cleaned.slice(0, max);
};

const runInBackground = (
  c: Context<HonoEnv>,
  label: string,
  task: () => Promise<unknown>,
): void => {
  c.executionCtx.waitUntil(
    task().catch((error: unknown) => {
      console.error(`${label} failed:`, safeErrorMessage(error));
    }),
  );
};

/**
 * Routes under `/api/contact`:
 *
 * - `GET /config`: whether the form is available and the public Turnstile
 *   settings.
 * - `POST /`: accepts a submission. See `docs/architecture.md` for the steps.
 */
export const contactRoutes = new Hono<HonoEnv>()
  .get('/config', (c) => {
    const { available } = getContactAvailability(c.env);
    const options = c.get('options').contact;
    const config: ContactConfig = {
      available,
      turnstileSiteKey: available ? (c.env.TURNSTILE_SITE_KEY ?? null) : null,
      turnstileAction: CONTACT_TURNSTILE_ACTION,
      honeypotField: CONTACT_HONEYPOT_FIELD,
      categories: options.categories ?? null,
    };
    return c.json(config);
  })
  .post('/', async (c) => {
    const env = c.env;
    const options = c.get('options');
    if (!getContactAvailability(env).available) {
      return apiError(c, 503, 'contact_unavailable');
    }
    const turnstileSecret = env.TURNSTILE_SECRET ?? '';
    const ipHashSecret = env.IP_HASH_SECRET ?? '';
    const limiter = env.CONTACT_RATE_LIMITER;
    if (!limiter) return apiError(c, 503, 'contact_unavailable');

    // 1. Origin, Content-Type, and size, before parsing anything.
    if (!isAllowedOrigin(c.req.raw)) {
      return apiError(c, 403, 'forbidden_origin');
    }
    const contentType = c.req.header('content-type') ?? '';
    if (!/^application\/json\s*(;|$)/i.test(contentType)) {
      return apiError(c, 415, 'unsupported_media_type');
    }
    const bodyText = await readBodyWithLimit(c.req.raw, CONTACT_MAX_BODY_BYTES);
    if (bodyText === null) return apiError(c, 413, 'payload_too_large');
    let raw: unknown;
    try {
      raw = JSON.parse(bodyText);
    } catch {
      return apiError(c, 400, 'invalid_json');
    }
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      return apiError(c, 400, 'invalid_json');
    }
    const input = raw as Record<string, unknown>;

    const now = Date.now();
    const ip = c.req.header('cf-connecting-ip');
    const ipHash = await hmacSha256Hex(ipHashSecret, ip ?? 'unknown');
    const cf = (c.req.raw as { cf?: { country?: unknown } }).cf;
    const meta = {
      ipHash,
      userAgent: text(c.req.header('user-agent'), USER_AGENT_MAX),
      country: typeof cf?.country === 'string' ? cf.country : null,
    };
    const origin = new URL(c.req.url).origin;

    // 2. Honeypot: pretend success and store nothing. Turnstile has not run
    //    yet, so a stored row would let a bot write to D1 without passing it.
    //    The request still counts against the rate limit, so the same
    //    address cannot follow up with real submissions at full speed.
    const honeypot = input[CONTACT_HONEYPOT_FIELD];
    if (typeof honeypot === 'string' && honeypot.trim() !== '') {
      await limiter.limit({ key: ipHash });
      console.info('contact: honeypot filled; nothing stored');
      return c.json({ ok: true });
    }

    // 3. Turnstile, including hostname and action. Failure stores nothing.
    const token = input.turnstileToken;
    if (typeof token !== 'string' || token === '' || token.length > 2048) {
      return apiError(c, 400, 'turnstile_failed');
    }
    const turnstile = await verifyTurnstile({
      secret: turnstileSecret,
      token,
      remoteIp: ip,
      hostnames: options.contact.turnstileHostnames ?? [
        new URL(c.req.url).hostname,
      ],
      action: CONTACT_TURNSTILE_ACTION,
    });
    if (!turnstile.ok) {
      console.warn(`contact: turnstile rejected (${turnstile.reason})`);
      return apiError(c, 400, 'turnstile_failed');
    }

    // 4. Rate limit per ip_hash.
    const { success } = await limiter.limit({ key: ipHash });
    if (!success) return apiError(c, 429, 'rate_limited');

    // 5. Validation and spam score.
    const parsed = contactRequestSchema.safeParse(input);
    if (!parsed.success) {
      return apiError(
        c,
        400,
        'invalid_input',
        contactFieldErrors(parsed.error, input),
      );
    }
    const data = parsed.data;
    const categories = options.contact.categories;
    if (data.category && categories && !categories.includes(data.category)) {
      return apiError(c, 400, 'invalid_input', { category: 'invalid' });
    }
    const spam = scoreSubmission(data);
    const status: SubmissionStatus =
      spam.score >= SPAM_HOLD_THRESHOLD ? 'held' : 'new';

    // 6. Save before responding.
    const id = ulid(now);
    try {
      await insertSubmission(env.DB, {
        id,
        createdAt: now,
        name: data.name,
        email: data.email,
        company: data.company ?? null,
        phone: data.phone ?? null,
        category: data.category ?? null,
        body: data.message,
        status,
        spamScore: spam.score,
        spamReasons: spam.reasons,
        ...meta,
        pagePath: data.pagePath ?? null,
        consentAt: now,
      });
    } catch (error) {
      console.error('contact: insert failed:', safeErrorMessage(error));
      return apiError(c, 500, 'server_error');
    }

    // 7. After the response: notification and pruning.
    const webhookUrl = env.SLACK_WEBHOOK_URL;
    if (status === 'new' && isSlackWebhookUrl(webhookUrl)) {
      runInBackground(c, 'slack', () =>
        sendSlackNotification({
          db: env.DB,
          webhookUrl,
          submissionId: id,
          payload: buildSlackPayload({
            locale: options.locale,
            category: data.category ?? null,
            allowedCategories: categories,
            adminUrl: `${origin}/admin/inquiries/${id}`,
          }),
        }),
      );
    }
    runInBackground(c, 'prune', () => pruneIfDue(env.DB, now));
    return c.json({ ok: true });
  });
