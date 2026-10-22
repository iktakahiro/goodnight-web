import * as z from 'zod';

/** Turnstile `action` the contact widget must use. The server checks it. */
export const CONTACT_TURNSTILE_ACTION = 'contact';

/**
 * Name of the hidden honeypot field. Real visitors leave it empty; a filled
 * value marks the submission as held without telling the sender.
 */
export const CONTACT_HONEYPOT_FIELD = 'website';

/** Largest accepted request body for `POST /api/contact`, in bytes. */
export const CONTACT_MAX_BODY_BYTES = 16 * 1024;

/** Maximum lengths of the contact fields, in characters. */
export const CONTACT_FIELD_LIMITS = {
  name: 100,
  email: 254,
  company: 200,
  phone: 40,
  category: 100,
  message: 5000,
  pagePath: 300,
} as const;

// C0 and C1 control characters, DEL, and Unicode line/paragraph separators.
// Multi-line fields keep tab and line feed.
// oxlint-disable-next-line no-control-regex
const SINGLE_LINE_CONTROLS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;
// oxlint-disable-next-line no-control-regex
const MULTI_LINE_CONTROLS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;

const singleLine = (value: string): string =>
  value.replace(SINGLE_LINE_CONTROLS, ' ').trim();

const multiLine = (value: string): string =>
  value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2028\u2029]/g, '\n')
    .replace(MULTI_LINE_CONTROLS, '')
    .trim();

const requiredLine = (max: number) =>
  z.string().transform(singleLine).pipe(z.string().min(1).max(max));

const optionalLine = (max: number) =>
  z
    .string()
    .optional()
    .transform((value) => {
      const cleaned = value === undefined ? '' : singleLine(value);
      return cleaned === '' ? undefined : cleaned;
    })
    .pipe(z.string().max(max).optional());

/**
 * The fields a visitor fills in. Use it for client-side validation in the
 * contact form; the server runs the same schema.
 *
 * Strings are cleaned before the checks: control characters are removed (line
 * breaks are kept only in `message`) and whitespace is trimmed. Empty optional
 * fields become `undefined`. `phone` is NFKC-normalized, so full-width digits
 * are accepted.
 */
export const contactFieldsSchema = z.object({
  name: requiredLine(CONTACT_FIELD_LIMITS.name),
  email: z
    .string()
    .transform(singleLine)
    .pipe(z.email().max(CONTACT_FIELD_LIMITS.email)),
  company: optionalLine(CONTACT_FIELD_LIMITS.company),
  phone: z
    .string()
    .optional()
    .transform((value) => {
      const cleaned =
        value === undefined ? '' : singleLine(value.normalize('NFKC'));
      return cleaned === '' ? undefined : cleaned;
    })
    .pipe(
      z
        .string()
        .max(CONTACT_FIELD_LIMITS.phone)
        .regex(/^[0-9+\-() ]+$/)
        .optional(),
    ),
  category: optionalLine(CONTACT_FIELD_LIMITS.category),
  message: z
    .string()
    .transform(multiLine)
    .pipe(z.string().min(1).max(CONTACT_FIELD_LIMITS.message)),
  consent: z.literal(true),
});

/**
 * The JSON body of `POST /api/contact`: the visitor's fields plus the
 * Turnstile token and form metadata.
 *
 * - `turnstileToken`: the token from the Turnstile widget.
 * - `website`: the honeypot field ({@link CONTACT_HONEYPOT_FIELD}).
 * - `elapsedMs`: milliseconds between showing the form and submitting it.
 *   Used for the spam score.
 * - `pagePath`: the path of the page that holds the form.
 */
export const contactRequestSchema = contactFieldsSchema.extend({
  turnstileToken: z.string().min(1).max(2048),
  website: z.string().max(500).optional(),
  elapsedMs: z.number().int().min(0).optional(),
  pagePath: z
    .string()
    .max(CONTACT_FIELD_LIMITS.pagePath)
    .regex(/^\/[^\s]*$/)
    .optional(),
});

/** Contact fields before validation (what the form collects). */
export type ContactFieldsInput = z.input<typeof contactFieldsSchema>;

/** Contact fields after validation and cleaning. */
export type ContactFields = z.output<typeof contactFieldsSchema>;

/** The `POST /api/contact` body before validation. */
export type ContactRequestInput = z.input<typeof contactRequestSchema>;

/** The `POST /api/contact` body after validation and cleaning. */
export type ContactRequest = z.output<typeof contactRequestSchema>;

/**
 * Per-field error code: `required` (missing or empty), `too_long`, or
 * `invalid`. Message catalogs have a `field.<code>` entry for each.
 */
export type ContactFieldErrorCode = 'required' | 'too_long' | 'invalid';

/**
 * Turns a zod error from {@link contactFieldsSchema} or
 * {@link contactRequestSchema} into one error code per top-level field.
 *
 * @param input - The value that was parsed, used to tell a missing field
 *   (`required`) from a value of the wrong type (`invalid`).
 */
export const contactFieldErrors = (
  error: z.ZodError,
  input: unknown,
): Record<string, ContactFieldErrorCode> => {
  const raw: Record<string, unknown> =
    typeof input === 'object' && input !== null
      ? (input as Record<string, unknown>)
      : {};
  const fields: Record<string, ContactFieldErrorCode> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field !== 'string' || field in fields) continue;
    if (issue.code === 'too_big') fields[field] = 'too_long';
    else if (
      issue.code === 'too_small' ||
      (issue.code === 'invalid_type' && raw[field] == null) ||
      (field === 'consent' && issue.code === 'invalid_value')
    ) {
      fields[field] = 'required';
    } else fields[field] = 'invalid';
  }
  return fields;
};
