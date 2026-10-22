/**
 * Better Auth's base path. The admin UI's auth client uses the same path.
 * Kept apart from auth.ts so the browser bundle can import it without the
 * server-side Better Auth code.
 */
export const AUTH_BASE_PATH = '/api/auth';
