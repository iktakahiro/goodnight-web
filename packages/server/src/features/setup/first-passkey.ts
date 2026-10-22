import type { D1Database } from '@cloudflare/workers-types';
import { APIError } from 'better-auth/api';
import { getDatabase } from '../../db/database.ts';
import { session as sessionTable } from '../../db/schema.ts';
import { checkPasskeySession } from '../auth/passkey-session.ts';
import { claimSetup, isSetupClosed, releaseSetupClaim } from './setup-state.ts';

// Setup claims by registration request, keyed by the request's Better Auth
// context object, which the passkey hook and the after hook share.
const claims = new WeakMap<object, string>();

/** A passkey registration, as {@link beforePasskeySaved} sees it. */
export interface PasskeyRegistration {
  /** The user the passkey is registered for. */
  userId: string;
  /** Creation time of the session that registers the passkey. */
  sessionCreatedAt: Date | undefined;
  /**
   * The request's Better Auth context (`ctx.context`). A setup claim made
   * for this request is kept under it for {@link afterPasskeyRegistration}.
   */
  request: object;
}

/**
 * Runs after a passkey registration is verified and before the passkey is
 * saved (the passkey plugin's `registration.afterVerification`).
 *
 * - A user who already has a passkey may add another one, but only from a
 *   session created at or after the first passkey (the `requireAdmin`
 *   rule). A setup session that outlived the first passkey cannot use it.
 * - A user without a passkey may register one only by claiming setup
 *   ({@link claimSetup}), one atomic statement that only one registration
 *   can win. The claim closes setup, so every session in the database is
 *   deleted next. Until then no passkey existed, so the only sessions are the
 *   ones setup created, and none of them proves a passkey. The browser gets
 *   a new session from the registration itself (`createSession: true`),
 *   created after the passkey.
 *
 * @throws {APIError} `UNAUTHORIZED` when the user has a passkey and the
 *   session is older than it.
 * @throws {APIError} `FORBIDDEN` when the user has no passkey and setup is
 *   closed or another registration claimed it first.
 */
export const beforePasskeySaved = async (
  db: D1Database,
  { userId, sessionCreatedAt, request }: PasskeyRegistration,
): Promise<void> => {
  const state = await checkPasskeySession(
    db,
    userId,
    sessionCreatedAt ?? new Date(0),
  );
  if (state === 'ok') return;
  if (state === 'too_old') {
    throw new APIError('UNAUTHORIZED', { message: 'passkey session required' });
  }
  if (await isSetupClosed(db)) {
    throw new APIError('FORBIDDEN', { message: 'setup closed' });
  }
  const claim = await claimSetup(db);
  if (!claim) throw new APIError('FORBIDDEN', { message: 'setup closed' });
  claims.set(request, claim);
  await getDatabase(db).delete(sessionTable);
};

/**
 * Runs after every passkey registration request, whatever its result. When
 * the request claimed setup but its passkey was not saved (the insert
 * failed), it releases the claim, so the owner can run setup again instead
 * of being locked out ({@link releaseSetupClaim}). After a saved passkey it
 * does nothing.
 *
 * @param request - The same context object passed to
 *   {@link beforePasskeySaved}.
 */
export const afterPasskeyRegistration = async (
  db: D1Database,
  request: object,
): Promise<void> => {
  const claim = claims.get(request);
  if (claim === undefined) return;
  claims.delete(request);
  await releaseSetupClaim(db, claim);
};
