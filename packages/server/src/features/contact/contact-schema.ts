import * as z from 'zod';
import { singleLine } from '../contact-form/form-values-schema.ts';

/** Turnstile `action` the contact widget must use. The server checks it. */
export const CONTACT_TURNSTILE_ACTION = 'contact';

/**
 * Name of the hidden honeypot field. Real visitors leave it empty. The name
 * means nothing to browsers and password managers, so they do not autofill
 * it. A filled honeypot does not change the response: the submission goes
 * through Turnstile, the rate limit, and validation like any other, and is
 * stored as suspected spam with the reason `honeypot` and no Slack
 * notification.
 */
export const CONTACT_HONEYPOT_FIELD = 'gnw_hp_x';

/**
 * Largest accepted request body for `POST /api/contact`, in bytes. The stored
 * field values have their own, smaller limit (`FORM_LIMITS.valuesBytes`).
 */
export const CONTACT_MAX_BODY_BYTES = 32 * 1024;

/** Maximum lengths of the fixed contact fields, in characters. */
export const CONTACT_FIELD_LIMITS = {
  email: 254,
  pagePath: 300,
} as const;

/**
 * The JSON body of `POST /api/contact`. Only the fixed parts are checked
 * here; `fields` is checked against the current form definition with
 * `buildFieldValuesSchema()`.
 *
 * - `email`: the visitor's address. Always on the form and required.
 * - `consent`: privacy policy consent. Must be `true`.
 * - `fields`: values of the form fields, keyed by field id.
 * - `formVersion`: the version of the form the visitor saw. When it is not
 *   the current version, the API answers 409 `form_outdated`.
 * - `locale`: the language of the page (`ja` or `en`).
 * - `turnstileToken`: the token from the Turnstile widget.
 * - `gnw_hp_x`: the honeypot field ({@link CONTACT_HONEYPOT_FIELD}). It is
 *   never stored.
 * - `elapsedMs`: milliseconds between showing the form and submitting it.
 *   Used for the spam score.
 * - `pagePath`: the path of the page that holds the form.
 *
 * Any other top-level key is rejected. The email is cleaned before the
 * check: control characters are removed and whitespace is trimmed.
 */
export const contactRequestSchema = z.strictObject({
  email: z
    .string()
    .transform(singleLine)
    .pipe(z.email().max(CONTACT_FIELD_LIMITS.email)),
  consent: z.literal(true),
  // Checked against the form definition later. Kept as parsed, so no key
  // (such as `__proto__`) is lost by copying.
  fields: z.custom<Record<string, unknown>>(
    (value) =>
      typeof value === 'object' && value !== null && !Array.isArray(value),
  ),
  formVersion: z.number().int().min(1).optional(),
  locale: z.enum(['ja', 'en']).optional(),
  turnstileToken: z.string().min(1).max(2048),
  [CONTACT_HONEYPOT_FIELD]: z.string().max(500).optional(),
  elapsedMs: z.number().int().min(0).optional(),
  pagePath: z
    .string()
    .max(CONTACT_FIELD_LIMITS.pagePath)
    .regex(/^\/[^\s]*$/)
    .optional(),
});

/** The `POST /api/contact` body after validation of the fixed parts. */
export type ContactRequest = z.output<typeof contactRequestSchema>;

/**
 * The `POST /api/contact` body as the contact form sends it. `fields` holds
 * strings for text, date, select, and radio fields, a number or a numeric
 * string for number fields, and a list of option values for checkbox fields.
 */
export interface ContactRequestInput {
  email: string;
  /** Send the real state: the server rejects `false`. */
  consent: boolean;
  fields: Record<string, string | number | string[]>;
  formVersion?: number;
  locale?: 'ja' | 'en';
  turnstileToken: string;
  /** The honeypot ({@link CONTACT_HONEYPOT_FIELD}); send what the field holds. */
  gnw_hp_x?: string;
  elapsedMs?: number;
  pagePath?: string;
}

/**
 * Per-field error code: `required` (missing or empty), `too_long`, or
 * `invalid`. Message catalogs have a `field.<code>` entry for each.
 */
export type ContactFieldErrorCode = 'required' | 'too_long' | 'invalid';

const isEmpty = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && value.trim() === '') ||
  (Array.isArray(value) && value.length === 0);

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/**
 * Turns zod errors into one error code per field. Fixed fields use their
 * name (`email`, `consent`); form fields use their id. Unknown keys in
 * `fields` are reported as `fields: invalid`. Unknown top-level keys get no
 * entry, so a key the client chose is never echoed back.
 *
 * @param error - From {@link contactRequestSchema}, or from the field values
 *   schema with `prefix` set to `fields`.
 * @param input - The value that was parsed, used to tell a missing field
 *   (`required`) from a value of the wrong type (`invalid`).
 * @param prefix - Path segment that holds the form fields, if any.
 */
export const contactFieldErrors = (
  error: z.ZodError,
  input: unknown,
  prefix?: 'fields',
): Record<string, ContactFieldErrorCode> => {
  const raw = asRecord(input);
  const fields: Record<string, ContactFieldErrorCode> = {};
  for (const issue of error.issues) {
    const path = prefix ? [prefix, ...issue.path] : issue.path;
    let key = path[0];
    let value: unknown = typeof key === 'string' ? raw[key] : undefined;
    if (key === 'fields' && typeof path[1] === 'string') {
      key = path[1];
      value = asRecord(raw.fields)[key];
    }
    if (typeof key !== 'string' || key in fields) continue;
    if (issue.code === 'unrecognized_keys') fields[key] = 'invalid';
    else if (issue.code === 'too_big') fields[key] = 'too_long';
    else if (
      isEmpty(value) ||
      issue.code === 'too_small' ||
      (key === 'consent' && issue.code === 'invalid_value')
    ) {
      fields[key] = 'required';
    } else fields[key] = 'invalid';
  }
  return fields;
};
