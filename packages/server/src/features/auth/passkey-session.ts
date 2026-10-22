import type { D1Database } from '@cloudflare/workers-types';
import { and, asc, eq, isNotNull } from 'drizzle-orm';
import { getDatabase } from '../../db/database.ts';
import { passkey } from '../../db/schema.ts';

/**
 * Result of {@link checkPasskeySession}:
 *
 * - `ok`: the session was created at or after the user's first passkey;
 * - `no_passkey`: the user has no passkey with a creation time;
 * - `too_old`: the session is older than the user's first passkey, so it
 *   came from setup, not from a passkey.
 */
export type PasskeySessionState = 'ok' | 'no_passkey' | 'too_old';

/**
 * Checks the session-time rule: only a session created at or after the
 * user's first passkey proves a passkey. Sessions from a passkey sign-in and
 * from the registration of the first passkey pass; a session from setup never
 * does (docs/decisions/0006). Passkey rows without `created_at` do not count.
 *
 * @param sessionCreatedAt - `session.createdAt` of the session to check.
 */
export const checkPasskeySession = async (
  db: D1Database,
  userId: string,
  sessionCreatedAt: Date,
): Promise<PasskeySessionState> => {
  const first = await getDatabase(db)
    .select({ createdAt: passkey.createdAt })
    .from(passkey)
    .where(and(eq(passkey.userId, userId), isNotNull(passkey.createdAt)))
    .orderBy(asc(passkey.createdAt))
    .get();
  if (!first?.createdAt) return 'no_passkey';
  return sessionCreatedAt.getTime() < first.createdAt.getTime()
    ? 'too_old'
    : 'ok';
};
