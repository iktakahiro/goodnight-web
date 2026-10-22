import type { ApiErrorBody, ApiErrorCode } from '../../shared/api-error.ts';
import { translate, type Locale } from '../../shared/messages.ts';
import type { ContactConfig } from './contact-routes.ts';
import type { ContactRequestInput } from './contact-schema.ts';

/** Path of the contact API on the site's Worker. */
export const CONTACT_API_PATH = '/api/contact';

/** Options shared by the contact client functions. */
export interface ContactClientOptions {
  /** Origin of the Worker. Defaults to the current page's origin. */
  baseUrl?: string;
  /** Language for `network_error` messages. Defaults to `en`. */
  locale?: Locale;
  signal?: AbortSignal;
  /** Custom `fetch`, for tests. */
  fetch?: typeof fetch;
}

/** Error codes {@link submitContact} can return. */
export type ContactErrorCode = ApiErrorCode | 'network_error';

/** Result of {@link submitContact}. It never throws for HTTP or network errors. */
export type ContactSubmitResult =
  | { ok: true }
  | {
      ok: false;
      code: ContactErrorCode;
      /** HTTP status, or 0 for a network error. */
      status: number;
      /** Message for the visitor, in the language the server picked. */
      message: string;
      /** Per-field codes (`required`, `too_long`, `invalid`) for `invalid_input`. */
      fields?: Record<string, string>;
    };

const url = (path: string, baseUrl: string | undefined) =>
  baseUrl ? new URL(path, baseUrl).toString() : path;

const isApiErrorBody = (value: unknown): value is ApiErrorBody =>
  typeof value === 'object' &&
  value !== null &&
  'error' in value &&
  typeof (value as { error: unknown }).error === 'object' &&
  typeof (value as { error: { code?: unknown } }).error?.code === 'string';

/**
 * Reads `GET /api/contact/config`. Show the form only when `available` is
 * `true`; otherwise show that it is not available yet.
 *
 * @returns `null` when the request fails.
 */
export const getContactConfig = async (
  options: ContactClientOptions = {},
): Promise<ContactConfig | null> => {
  const doFetch = options.fetch ?? fetch;
  try {
    const response = await doFetch(
      url(`${CONTACT_API_PATH}/config`, options.baseUrl),
      { signal: options.signal, headers: { accept: 'application/json' } },
    );
    if (!response.ok) return null;
    return (await response.json()) as ContactConfig;
  } catch {
    return null;
  }
};

/**
 * Sends the contact form to `POST /api/contact`.
 *
 * Pass the Turnstile token as `turnstileToken`, the honeypot input as
 * `website`, and `elapsedMs` (time since the form was shown) for the spam
 * score. A honeypot submission also returns `{ ok: true }`.
 *
 * Get a new Turnstile token before retrying after `turnstile_failed`: tokens
 * are single-use.
 */
export const submitContact = async (
  input: ContactRequestInput,
  options: ContactClientOptions = {},
): Promise<ContactSubmitResult> => {
  const doFetch = options.fetch ?? fetch;
  let response: Response;
  try {
    response = await doFetch(url(CONTACT_API_PATH, options.baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(options.locale ? { 'accept-language': options.locale } : {}),
      },
      body: JSON.stringify(input),
      signal: options.signal,
    });
  } catch {
    return {
      ok: false,
      code: 'network_error',
      status: 0,
      message: translate(options.locale ?? 'en', 'error.network_error'),
    };
  }
  if (response.ok) return { ok: true };
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Not JSON, for example a proxy error page.
  }
  if (isApiErrorBody(body)) {
    return {
      ok: false,
      code: body.error.code,
      status: response.status,
      message: body.error.message,
      ...(body.error.fields ? { fields: body.error.fields } : {}),
    };
  }
  return {
    ok: false,
    code: 'server_error',
    status: response.status,
    message: translate(options.locale ?? 'en', 'error.server_error'),
  };
};
