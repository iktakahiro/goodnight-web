import type { D1Database } from '@cloudflare/workers-types';

/** Retention period when `settings.retention_days` is missing or invalid. */
export const DEFAULT_RETENTION_DAYS = 180;

/** Pruning runs at most once per this interval (one hour). */
export const PRUNE_INTERVAL_MS = 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Result of {@link pruneIfDue}. */
export type PruneResult =
  | { ran: false }
  | { ran: true; deleted: number; retentionDays: number };

/** Reads `settings.retention_days`, clamped to 1–3650 days. */
export const getRetentionDays = async (db: D1Database): Promise<number> => {
  const value = await db
    .prepare("SELECT value FROM settings WHERE key = 'retention_days'")
    .first<string>('value');
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1) return DEFAULT_RETENTION_DAYS;
  return Math.min(days, 3650);
};

/**
 * Deletes submissions older than the retention period, at most once per
 * {@link PRUNE_INTERVAL_MS}. There is no Cron Trigger: the contact API and the
 * admin list call this inside `ctx.waitUntil`.
 *
 * The run is claimed with one conditional upsert of
 * `settings.last_cleanup_at`, so concurrent requests do not both prune.
 */
export const pruneIfDue = async (
  db: D1Database,
  now: number = Date.now(),
): Promise<PruneResult> => {
  const claim = await db
    .prepare(
      `INSERT INTO settings (key, value) VALUES ('last_cleanup_at', ?1)
      ON CONFLICT (key) DO UPDATE SET value = excluded.value
      WHERE CAST(settings.value AS INTEGER) <= ?2`,
    )
    .bind(String(now), now - PRUNE_INTERVAL_MS)
    .run();
  if (claim.meta.changes === 0) return { ran: false };
  const retentionDays = await getRetentionDays(db);
  const result = await db
    .prepare('DELETE FROM submissions WHERE created_at < ?1')
    .bind(now - retentionDays * DAY_MS)
    .run();
  return { ran: true, deleted: result.meta.changes, retentionDays };
};
