import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { HonoEnv } from '../hono-env.ts';
import { pickLocale, translate, type MessageKey } from './messages.ts';

/** Error codes returned by the API in `{ error: { code } }`. */
export type ApiErrorCode = MessageKey extends infer Key
  ? Key extends `error.${infer Code}`
    ? Code
    : never
  : never;

/** JSON body of every API error response. */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    /** Message in the language picked from `Accept-Language`. */
    message: string;
    /** Per-field error codes for `invalid_input`. */
    fields?: Record<string, string>;
  };
}

/**
 * Builds an API error response. The message language follows the request's
 * `Accept-Language`, falling back to the site's configured locale.
 */
export const apiError = (
  c: Context<HonoEnv>,
  status: ContentfulStatusCode,
  code: ApiErrorCode,
  fields?: Record<string, string>,
): Response => {
  const locale = pickLocale(
    c.req.header('accept-language'),
    c.get('options').locale,
  );
  const body: ApiErrorBody = {
    error: {
      code,
      message: translate(locale, `error.${code}`),
      ...(fields ? { fields } : {}),
    },
  };
  return c.json(body, status);
};
