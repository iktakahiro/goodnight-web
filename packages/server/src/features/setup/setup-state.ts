import type { D1Database } from '@cloudflare/workers-types';
import { and, eq, notExists } from 'drizzle-orm';
import { getDatabase } from '../../db/database.ts';
import { passkey, settings } from '../../db/schema.ts';
import type { GoodnightEnv } from '../../env.ts';
import { secretProblem } from '../../shared/app-secret.ts';
import { parseAdminEmails } from '../auth/admin-emails.ts';

/**
 * A setting that keeps setup off: `missing`, or `too_short` for a secret
 * shorter than `MIN_SECRET_LENGTH` characters.
 */
export interface SetupProblem {
  name:
    | 'APP_SECRET'
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
 *
 * `APP_SECRET` stands in for the three secrets when they are not set, so a
 * secret that is neither set nor filled in is reported as `APP_SECRET`, once
 * (`secretProblem`).
 *
 * @param env - A resolved env (`resolveAppSecret`).
 */
export const setupProblems = (env: GoodnightEnv): SetupProblem[] => {
  const problems: SetupProblem[] = [];
  for (const name of [
    'SETUP_TOKEN',
    'BETTER_AUTH_SECRET',
    'IP_HASH_SECRET',
  ] as const) {
    const problem = secretProblem(env, name);
    if (problem && !problems.some(({ name }) => name === problem.name)) {
      problems.push(problem);
    }
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

const SETUP_CLOSED_AT = 'setup_closed_at';

/**
 * Returns whether setup is closed. Setup closes when the first passkey is
 * registered, not when a user is created, so a person who left before
 * registering a passkey can run setup again. {@link claimSetup} writes
 * `settings.setup_closed_at` before the first passkey is saved, and a
 * database trigger also records it on the first passkey insert, so setup
 * stays closed even if every passkey is deleted later.
 */
export const isSetupClosed = async (db: D1Database): Promise<boolean> => {
  const orm = getDatabase(db);
  const [closed, passkeys] = await orm.batch([
    orm
      .select({ key: settings.key })
      .from(settings)
      .where(eq(settings.key, SETUP_CLOSED_AT))
      .limit(1),
    orm.select({ id: passkey.id }).from(passkey).limit(1),
  ]);
  return closed.length > 0 || passkeys.length > 0;
};

/**
 * Closes setup for one first-passkey registration, atomically. A single
 * `INSERT ... ON CONFLICT DO NOTHING` on the `setup_closed_at` key decides:
 * of any number of concurrent registrations, exactly one inserts the row.
 *
 * @returns The claim (the stored unix ms value) when this call closed setup,
 *   or `null` when setup was already closed or claimed.
 */
export const claimSetup = async (db: D1Database): Promise<string | null> => {
  const value = String(Date.now());
  const rows = await getDatabase(db)
    .insert(settings)
    .values({ key: SETUP_CLOSED_AT, value })
    .onConflictDoNothing()
    .returning({ value: settings.value });
  return rows.length === 1 ? value : null;
};

/**
 * Opens setup again after a claimed registration failed to save its
 * passkey, so the owner is not locked out. The delete matches only the
 * caller's own claim, and only while no passkey exists, so it never reopens
 * setup that a saved passkey has closed.
 *
 * @param claim - The value returned by {@link claimSetup}.
 */
export const releaseSetupClaim = async (
  db: D1Database,
  claim: string,
): Promise<void> => {
  const orm = getDatabase(db);
  await orm
    .delete(settings)
    .where(
      and(
        eq(settings.key, SETUP_CLOSED_AT),
        eq(settings.value, claim),
        notExists(orm.select({ id: passkey.id }).from(passkey)),
      ),
    );
};
