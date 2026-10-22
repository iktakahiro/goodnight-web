// Package entry point for `@goodnight-web/server/contact`: the contact form
// schema and constants, safe to import in the browser.
export {
  CONTACT_FIELD_LIMITS,
  CONTACT_HONEYPOT_FIELD,
  CONTACT_MAX_BODY_BYTES,
  CONTACT_TURNSTILE_ACTION,
  contactFieldErrors,
  contactFieldsSchema,
  contactRequestSchema,
  type ContactFieldErrorCode,
  type ContactFields,
  type ContactFieldsInput,
  type ContactRequest,
  type ContactRequestInput,
} from './features/contact/contact-schema.ts';
export {
  SPAM_HOLD_THRESHOLD,
  SPAM_MIN_ELAPSED_MS,
  scoreSubmission,
  type SpamScore,
} from './features/contact/spam-score.ts';
export type { ContactConfig } from './features/contact/contact-routes.ts';
