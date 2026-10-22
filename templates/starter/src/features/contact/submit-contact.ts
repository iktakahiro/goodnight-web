/**
 * The result of sending the contact form, used to choose the message shown
 * to the visitor.
 *
 * - `success`: the inquiry was saved.
 * - `unavailable`: the form is not accepting inquiries (for example, Turnstile
 *   is not set up yet).
 * - `invalid`: the server rejected the input or the Turnstile check.
 * - `rate-limited`: too many submissions in a short time.
 * - `error`: a network or server error.
 */
export type SubmitResult =
  | { status: 'success' }
  | { status: 'unavailable' }
  | { status: 'invalid' }
  | { status: 'rate-limited' }
  | { status: 'error' };

/**
 * Sends the contact form.
 *
 * PHASE 2 PLACEHOLDER: replace this function body with the client helper from
 * `@goodnight-web/server`, which posts the form to `/api/contact` with the
 * Turnstile token. Until then it sends nothing and reports that the form is
 * not available, so no inquiry can be lost silently.
 */
export async function submitContact(
  _form: HTMLFormElement,
): Promise<SubmitResult> {
  return { status: 'unavailable' };
}
