import type { D1Database } from '@cloudflare/workers-types';
import type { GoodnightEnv } from '../../env.ts';
import { parseAdminEmails } from '../auth/admin-emails.ts';

/**
 * Returns whether setup has what it needs: `SETUP_TOKEN`, `ADMIN_EMAILS`, and
 * the attempt limit (`IP_HASH_SECRET` and the `CONTACT_RATE_LIMITER`
 * binding). Without the limit, setup stays off (fail closed).
 */
export const isSetupConfigured = (env: GoodnightEnv): boolean =>
  Boolean(env.SETUP_TOKEN) &&
  parseAdminEmails(env.ADMIN_EMAILS).length > 0 &&
  Boolean(env.IP_HASH_SECRET) &&
  typeof env.CONTACT_RATE_LIMITER?.limit === 'function';

/**
 * Returns whether setup is closed. Setup closes when the first passkey is
 * registered, not when a user is created, so a person who left before
 * registering a passkey can run setup again. A database trigger records
 * `settings.setup_closed_at` on the first passkey insert, so setup stays
 * closed even if every passkey is deleted later.
 */
export const isSetupClosed = async (db: D1Database): Promise<boolean> =>
  (await db
    .prepare(
      `SELECT 1 AS found WHERE
        EXISTS (SELECT 1 FROM settings WHERE key = 'setup_closed_at')
        OR EXISTS (SELECT 1 FROM passkey)`,
    )
    .first()) !== null;
