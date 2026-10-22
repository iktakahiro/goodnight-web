import type { D1Database } from '@cloudflare/workers-types';
import type { GoodnightEnv } from '../../env.ts';
import { parseAdminEmails } from '../auth/admin-emails.ts';

/** Returns whether `SETUP_TOKEN` and `ADMIN_EMAILS` are both set. */
export const isSetupConfigured = (env: GoodnightEnv): boolean =>
  Boolean(env.SETUP_TOKEN) && parseAdminEmails(env.ADMIN_EMAILS).length > 0;

/**
 * Returns whether setup is closed. Setup closes when any passkey exists, not
 * when a user exists, so a person who left before registering a passkey can
 * run setup again.
 */
export const isSetupClosed = async (db: D1Database): Promise<boolean> =>
  (await db.prepare('SELECT 1 AS found FROM passkey LIMIT 1').first()) !== null;
