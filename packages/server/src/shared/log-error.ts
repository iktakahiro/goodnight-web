import { DrizzleQueryError } from 'drizzle-orm';

/**
 * Returns an error message that is safe to log. A failed Drizzle query puts
 * its SQL and bound values (names, addresses, message bodies, session tokens)
 * in its message, so only the database's own error message is kept.
 */
export const safeErrorMessage = (error: unknown): string => {
  if (error instanceof DrizzleQueryError) {
    return error.cause instanceof Error ? error.cause.message : 'query failed';
  }
  return error instanceof Error ? error.message : 'unknown error';
};
