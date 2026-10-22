import type { D1Database } from '@cloudflare/workers-types';
import { eq } from 'drizzle-orm';
import { getDatabase } from '../../db/database.ts';
import { passkey, settings } from '../../db/schema.ts';
import type { GoodnightEnv } from '../../env.ts';
import { secretState } from '../../shared/secret-length.ts';
import { parseAdminEmails } from '../auth/admin-emails.ts';

/**
 * A setting that keeps setup off: `missing`, or `too_short` for a secret
 * shorter than `MIN_SECRET_LENGTH` characters.
 */
export interface SetupProblem {
  name:
    | 'SETUP_TOKEN'
    | 'ADMIN_EMAILS'
    | 'BETTER_AUTH_SECRET'
    | 'IP_HASH_SECRET'
    | 'CONTACT_RATE_LIMITER';
  issue: 'missing' | 'too_short';
}

/**
 * Lists the settings that keep setup off. Setup needs `SETUP_TOKEN`,
 * `ADMIN_EMAILS`, `BETTER_AUTH_SECRET`, and the attempt limit
 * (`IP_HASH_SECRET` and the `CONTACT_RATE_LIMITER` binding). The three
 * secrets must be at least `MIN_SECRET_LENGTH` characters. Names only; never
 * values.
 */
export const setupProblems = (env: GoodnightEnv): SetupProblem[] => {
  const problems: SetupProblem[] = [];
  for (const name of [
    'SETUP_TOKEN',
    'BETTER_AUTH_SECRET',
    'IP_HASH_SECRET',
  ] as const) {
    const state = secretState(env[name]);
    if (state !== 'ok') problems.push({ name, issue: state });
  }
  if (parseAdminEmails(env.ADMIN_EMAILS).length === 0) {
    problems.push({ name: 'ADMIN_EMAILS', issue: 'missing' });
  }
  if (typeof env.CONTACT_RATE_LIMITER?.limit !== 'function') {
    problems.push({ name: 'CONTACT_RATE_LIMITER', issue: 'missing' });
  }
  return problems;
};

/**
 * Returns whether setup has what it needs ({@link setupProblems} is empty).
 * Otherwise setup stays off (fail closed).
 */
export const isSetupConfigured = (env: GoodnightEnv): boolean =>
  setupProblems(env).length === 0;

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
