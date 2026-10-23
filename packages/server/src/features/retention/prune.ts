import type { D1Database } from '@cloudflare/workers-types';
import { eq, lt, lte, sql } from 'drizzle-orm';
import { getDatabase } from '../../db/database.ts';
import {
  session,
  settings,
  submissions,
  verification,
} from '../../db/schema.ts';

/** Retention period when `settings.retention_days` is missing or invalid. */
export const DEFAULT_RETENTION_DAYS = 180;

/** Pruning runs at most once per this interval (one hour). */
export const PRUNE_INTERVAL_MS = 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Result of {@link pruneIfDue}. */
export type PruneResult =
  | { ran: false }
  | {
      ran: true;
      /** Submissions deleted. */
      deleted: number;
      /** Expired Better Auth `verification` rows deleted. */
      verificationsDeleted: number;
      /** Expired Better Auth `session` rows deleted. */
      sessionsDeleted: number;
      retentionDays: number;
    };

/** Reads `settings.retention_days`, clamped to 1–3650 days. */
export const getRetentionDays = async (db: D1Database): Promise<number> => {
  const row = await getDatabase(db)
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, 'retention_days'))
    .get();
  const value = row?.value;
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1) return DEFAULT_RETENTION_DAYS;
  return Math.min(days, 3650);
};

/**
 * Deletes submissions older than the retention period and expired Better
 * Auth `verification` and `session` rows, at most once per
 * {@link PRUNE_INTERVAL_MS}. There is no Cron Trigger: the contact API, the
 * admin list, and the public passkey sign-in endpoints call this inside
 * `ctx.waitUntil`, so pruning happens only while the site gets requests.
 *
 * Each passkey sign-in attempt writes a challenge to `verification`. Better
 * Auth deletes a challenge when it is used, but an abandoned one stays, so
 * expired rows are deleted here. The table stays small (challenges expire
 * after a few minutes and the sign-in endpoints are rate-limited), so the
 * delete needs no index on `expires_at`.
 *
 * An expired session keeps its token and user agent until Better Auth sees
 * the token again, which may never happen, so expired sessions are deleted
 * here too. Only admins have sessions, so that table is small as well and
 * needs no index on `expires_at` either.
 *
 * The run is claimed with one conditional upsert of
 * `settings.last_cleanup_at`, so concurrent requests do not both prune.
 */
export const pruneIfDue = async (
  db: D1Database,
  now: number = Date.now(),
): Promise<PruneResult> => {
  const orm = getDatabase(db);
  const claim = await orm
    .insert(settings)
    .values({ key: 'last_cleanup_at', value: String(now) })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: sql`excluded.value` },
      setWhere: lte(
        sql`cast(${settings.value} as integer)`,
        now - PRUNE_INTERVAL_MS,
      ),
    });
  if (claim.meta.changes === 0) return { ran: false };
  const retentionDays = await getRetentionDays(db);
  const result = await orm
    .delete(submissions)
    .where(lt(submissions.createdAt, now - retentionDays * DAY_MS));
  const verifications = await orm
    .delete(verification)
    .where(lt(verification.expiresAt, new Date(now)));
  const sessions = await orm
    .delete(session)
    .where(lt(session.expiresAt, new Date(now)));
  return {
    ran: true,
    deleted: result.meta.changes,
    verificationsDeleted: verifications.meta.changes,
    sessionsDeleted: sessions.meta.changes,
    retentionDays,
  };
};
