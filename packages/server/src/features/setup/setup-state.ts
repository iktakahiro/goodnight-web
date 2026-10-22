import type { D1Database } from '@cloudflare/workers-types';
import { eq } from 'drizzle-orm';
import { getDatabase } from '../../db/database.ts';
import { passkey, settings } from '../../db/schema.ts';
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
export const isSetupClosed = async (db: D1Database): Promise<boolean> => {
  const orm = getDatabase(db);
  const [closed, passkeys] = await orm.batch([
    orm
      .select({ key: settings.key })
      .from(settings)
      .where(eq(settings.key, 'setup_closed_at'))
      .limit(1),
    orm.select({ id: passkey.id }).from(passkey).limit(1),
  ]);
  return closed.length > 0 || passkeys.length > 0;
};
