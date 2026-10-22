// Package entry point for `@goodnight-web/server/client`: browser helpers for
// the contact form. It does not import zod or any server code.
export {
  CONTACT_API_PATH,
  getContactConfig,
  submitContact,
  type ContactClientOptions,
  type ContactErrorCode,
  type ContactSubmitResult,
} from './features/contact/contact-client.ts';
export type { ContactConfig } from './features/contact/contact-routes.ts';
export type { ContactRequestInput } from './features/contact/contact-schema.ts';
