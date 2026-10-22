import { DrizzleQueryError } from 'drizzle-orm';

// A Drizzle query error message: `Failed query: <sql>\nparams: <values>`.
const QUERY_TEXT = /Failed query:[\s\S]*/;

// Errors nest through `cause` (a library error wrapping a query error); the
// limit stops a cyclic chain.
const MAX_CAUSE_DEPTH = 8;

/**
 * Returns `text` with any Drizzle query text (the SQL and its bound values)
 * replaced by a placeholder. Use it for log messages that may embed an error
 * message, such as those Better Auth passes to its logger.
 */
export const redactQueryText = (text: string): string =>
  text.replace(QUERY_TEXT, 'Failed query: [redacted]');

/**
 * Returns an error message that is safe to log. A failed Drizzle query puts
 * its SQL and bound values (names, addresses, message bodies, session tokens)
 * in its message, so for a query error anywhere in the `cause` chain only the
 * database's own error message is kept. Other messages pass through
 * {@link redactQueryText}. Log only this result, never the error object.
 */
export const safeErrorMessage = (error: unknown): string => {
  let current: unknown = error;
  for (let depth = 0; current instanceof Error; depth++) {
    if (current instanceof DrizzleQueryError) {
      return current.cause instanceof Error
        ? redactQueryText(current.cause.message)
        : 'query failed';
    }
    if (depth >= MAX_CAUSE_DEPTH) break;
    current = current.cause;
  }
  return error instanceof Error
    ? redactQueryText(error.message)
    : 'unknown error';
};
