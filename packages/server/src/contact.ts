// Package entry point for `@goodnight-web/server/contact`: the contact form
// schemas and constants, safe to import in the browser.
export {
  CONTACT_FIELD_LIMITS,
  CONTACT_HONEYPOT_FIELD,
  CONTACT_MAX_BODY_BYTES,
  CONTACT_TURNSTILE_ACTION,
  contactFieldErrors,
  contactRequestSchema,
  type ContactFieldErrorCode,
  type ContactRequest,
  type ContactRequestInput,
} from './features/contact/contact-schema.ts';
export {
  DEFAULT_MAX_LENGTH,
  FIELD_ID_PATTERN,
  FORM_FIELD_TYPES,
  FORM_LIMITS,
  formFieldInputSchema,
  formUpdateSchema,
  localizedText,
  valueShape,
  type FormDefinition,
  type FormField,
  type FormFieldInput,
  type FormFieldOption,
  type FormFieldType,
  type FormUpdate,
  type LocalizedText,
} from './features/contact-form/form-definition.ts';
export {
  buildFieldValuesSchema,
  type FieldValue,
  type FieldValues,
} from './features/contact-form/form-values-schema.ts';
export {
  SPAM_HOLD_THRESHOLD,
  SPAM_MIN_ELAPSED_MS,
  scoreSubmission,
  type SpamScore,
} from './features/contact/spam-score.ts';
export type { PublicContactForm } from './features/contact/contact-routes.ts';
