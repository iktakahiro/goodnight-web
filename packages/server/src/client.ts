// Package entry point for `@goodnight-web/server/client`: browser helpers for
// the contact form. It does not import zod or any server code.
export {
  CONTACT_API_PATH,
  getContactForm,
  submitContact,
  type ContactClientOptions,
  type ContactErrorCode,
  type ContactSubmitResult,
} from './features/contact/contact-client.ts';
export type {
  PublicContactForm,
  PublicFormField,
} from './features/contact/contact-routes.ts';
export type { ContactRequestInput } from './features/contact/contact-schema.ts';
export type {
  FormFieldType,
  LocalizedText,
} from './features/contact-form/form-definition.ts';
