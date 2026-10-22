import type { D1Database } from '@cloudflare/workers-types';
import { APIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import { getDatabase } from '../../db/database.ts';
import { passkey, session } from '../../db/schema.ts';
import { isSetupClosed } from './setup-state.ts';

/**
 * Runs after a passkey registration is verified and before the passkey is
 * saved (the passkey plugin's `registration.afterVerification`).
 *
 * - A user who already has a passkey may add another one.
 * - A user without a passkey may register one only while setup is open.
 *   That passkey closes setup, so every session in the database is deleted
 *   first. Until then the only sessions are the ones setup created, and none
 *   of them proves a passkey. The browser gets a new session from the
 *   registration itself (`createSession: true`), created after the passkey.
 *
 * @param userId - The user the passkey is registered for.
 * @throws {APIError} `FORBIDDEN` when setup is closed and the user has no
 *   passkey (a session from an earlier setup run cannot create another
 *   admin).
 */
export const beforePasskeySaved = async (
  db: D1Database,
  userId: string,
): Promise<void> => {
  const orm = getDatabase(db);
  const existing = await orm
    .select({ id: passkey.id })
    .from(passkey)
    .where(eq(passkey.userId, userId))
    .get();
  if (existing) return;
  if (await isSetupClosed(db)) {
    throw new APIError('FORBIDDEN', { message: 'setup closed' });
  }
  await orm.delete(session);
};
