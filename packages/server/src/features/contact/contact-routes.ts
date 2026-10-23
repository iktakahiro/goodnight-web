import { Hono, type Context } from 'hono';
import type { HonoEnv } from '../../hono-env.ts';
import { apiError } from '../../shared/api-error.ts';
import { hmacSha256Hex } from '../../shared/crypto.ts';
import { isAllowedOrigin, readBodyWithLimit } from '../../shared/request.ts';
import { ipRateLimitKey } from '../../shared/ip-rate-limit.ts';
import { ulid } from '../../shared/ulid.ts';
import {
  FORM_LIMITS,
  fieldMaxLength,
  isTextFieldType,
  type FormField,
  type FormFieldType,
  type LocalizedText,
} from '../contact-form/form-definition.ts';
import { getCurrentForm } from '../contact-form/form-store.ts';
import { buildFieldValuesSchema } from '../contact-form/form-values-schema.ts';
import {
  buildSlackPayload,
  isSlackWebhookUrl,
  sendSlackNotification,
} from '../notify/slack.ts';
import { pruneIfDue } from '../retention/prune.ts';
import {
  countSubmissionsSince,
  insertSubmission,
} from '../submissions/submission-store.ts';
import { getContactAvailability } from './contact-availability.ts';
import {
  CONTACT_FIELD_LIMITS,
  CONTACT_HONEYPOT_FIELD,
  CONTACT_HOURLY_INSERT_QUOTA,
  CONTACT_MAX_BODY_BYTES,
  CONTACT_TURNSTILE_ACTION,
  contactFieldErrors,
  contactRequestSchema,
} from './contact-schema.ts';
import { SPAM_SUSPECT_THRESHOLD, scoreSubmission } from './spam-score.ts';
import { verifyTurnstile } from './turnstile.ts';
import { safeErrorMessage } from '../../shared/log-error.ts';

const HOUR_MS = 60 * 60 * 1000;

/** A field of the public form: what the contact form needs to render it. */
export interface PublicFormField {
  /** Send the value under this id in `fields`. */
  id: string;
  type: FormFieldType;
  label: LocalizedText;
  placeholder?: LocalizedText;
  hint?: LocalizedText;
  required: boolean;
  /** Text types only: the resolved maximum length in characters. */
  maxLength?: number;
  /** Select, radio, and checkbox fields only. */
  options?: { value: string; label: LocalizedText }[];
}

/** Body of `GET /api/contact/form`, read by the contact form. */
export interface PublicContactForm {
  /** `false` when the contact API answers 503 (a setting is missing). */
  available: boolean;
  /** Public Turnstile site key, or `null` when not available. */
  turnstileSiteKey: string | null;
  turnstileAction: string;
  honeypotField: string;
  /** Send it back as `formVersion`. */
  version: number;
  /** The fixed email field; always on the form and required. */
  email: { maxLength: number };
  /** The editable fields, in order. */
  fields: PublicFormField[];
}

/** How long browsers and caches may keep `GET /api/contact/form`. */
export const CONTACT_FORM_CACHE_CONTROL = 'public, max-age=30';

const publicField = (field: FormField): PublicFormField => ({
  id: field.id,
  type: field.type,
  label: field.label,
  ...(field.placeholder ? { placeholder: field.placeholder } : {}),
  ...(field.hint ? { hint: field.hint } : {}),
  required: field.required,
  ...(isTextFieldType(field.type) ? { maxLength: fieldMaxLength(field) } : {}),
  ...(field.options ? { options: field.options } : {}),
});

// Compiled value schemas, by D1 binding and form version. A version never
// changes, so the schema is built once per isolate.
const schemaCache = new WeakMap<
  object,
  { version: number; schema: ReturnType<typeof buildFieldValuesSchema> }
>();

const valuesSchemaFor = (db: object, version: number, fields: FormField[]) => {
  const cached = schemaCache.get(db);
  if (cached?.version === version) return cached.schema;
  const schema = buildFieldValuesSchema(fields);
  schemaCache.set(db, { version, schema });
  return schema;
};

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
 * - `GET /form`: {@link PublicContactForm}: the current form definition and
 *   whether the form is available. Cached briefly
 *   ({@link CONTACT_FORM_CACHE_CONTROL}).
 * - `POST /`: accepts a submission. See `docs/architecture.md` for the steps.
 */
export const contactRoutes = new Hono<HonoEnv>()
  .get('/form', async (c) => {
    const { available } = getContactAvailability(c.env);
    const current = await getCurrentForm(c.env.DB);
    const form: PublicContactForm = {
      available,
      turnstileSiteKey: available ? (c.env.TURNSTILE_SITE_KEY ?? null) : null,
      turnstileAction: CONTACT_TURNSTILE_ACTION,
      honeypotField: CONTACT_HONEYPOT_FIELD,
      version: current.version,
      email: { maxLength: CONTACT_FIELD_LIMITS.email },
      fields: current.definition.fields.map(publicField),
    };
    c.set('cacheControl', CONTACT_FORM_CACHE_CONTROL);
    return c.json(form);
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

    // 2. Honeypot: note it and carry on. A filled honeypot changes nothing
    //    in the response; the submission still needs Turnstile, counts
    //    against the rate limit, and must validate before it is stored as
    //    suspected spam (docs/decisions/0009).
    const honeypotValue = input[CONTACT_HONEYPOT_FIELD];
    const honeypot =
      typeof honeypotValue === 'string'
        ? honeypotValue.trim() !== ''
        : honeypotValue !== undefined && honeypotValue !== null;

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

    // 4. Rate limit per client: the IPv4 address, or the IPv6 /64 prefix,
    //    hashed like ip_hash.
    const { success } = await limiter.limit({
      key: await ipRateLimitKey(ipHashSecret, ip),
    });
    if (!success) return apiError(c, 429, 'rate_limited');

    // 5. Validation against the current form definition, and spam score.
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
    const form = await getCurrentForm(env.DB);
    if (data.formVersion !== undefined && data.formVersion !== form.version) {
      return apiError(c, 409, 'form_outdated');
    }
    const fields = form.definition.fields;
    const values = valuesSchemaFor(env.DB, form.version, fields).safeParse(
      data.fields,
    );
    if (!values.success) {
      return apiError(
        c,
        400,
        'invalid_input',
        contactFieldErrors(values.error, input, 'fields'),
      );
    }
    if (
      new TextEncoder().encode(JSON.stringify(values.data)).byteLength >
      FORM_LIMITS.valuesBytes
    ) {
      return apiError(c, 413, 'payload_too_large');
    }
    const spam = scoreSubmission({
      fields,
      values: values.data,
      elapsedMs: data.elapsedMs,
    });
    const suspectedSpam = honeypot || spam.score >= SPAM_SUSPECT_THRESHOLD;
    const spamReasons = honeypot ? ['honeypot', ...spam.reasons] : spam.reasons;

    // 6. Global quota across all senders, after Turnstile and validation so
    //    only submissions that would be stored count. Over it, nothing is
    //    stored and the visitor is told to try again later.
    //    The count and the insert are two statements, so requests that
    //    arrive at the same moment can go slightly over: the quota bounds
    //    growth, it is not an exact limit.
    const storedLastHour = await countSubmissionsSince(env.DB, now - HOUR_MS);
    if (storedLastHour >= CONTACT_HOURLY_INSERT_QUOTA) {
      console.warn('contact: hourly insert quota reached; nothing stored');
      return apiError(c, 503, 'contact_busy');
    }

    // 7. Save before responding.
    const id = ulid(now);
    try {
      await insertSubmission(env.DB, {
        id,
        createdAt: now,
        email: data.email,
        fields: values.data,
        formVersion: form.version,
        locale: data.locale ?? null,
        status: 'unread',
        suspectedSpam,
        spamScore: spam.score,
        spamReasons,
        ...meta,
        pagePath: data.pagePath ?? null,
        consentAt: now,
      });
    } catch (error) {
      console.error('contact: insert failed:', safeErrorMessage(error));
      return apiError(c, 500, 'server_error');
    }
    if (honeypot)
      console.info('contact: honeypot filled; stored as suspected spam');

    // 8. After the response: notification (never for suspected spam) and
    //    pruning.
    const webhookUrl = env.SLACK_WEBHOOK_URL;
    if (!suspectedSpam && isSlackWebhookUrl(webhookUrl)) {
      runInBackground(c, 'slack', () =>
        sendSlackNotification({
          db: env.DB,
          webhookUrl,
          submissionId: id,
          payload: buildSlackPayload({
            locale: options.locale,
            receivedAt: now,
            adminUrl: `${origin}/admin/inquiries/${id}`,
          }),
        }),
      );
    }
    runInBackground(c, 'prune', () => pruneIfDue(env.DB, now));
    return c.json({ ok: true });
  });
