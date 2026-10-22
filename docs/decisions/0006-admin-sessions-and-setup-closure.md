# 0006. Admin sessions and setup closure

- Status: accepted
- Date: 2026-10-22

## Context

The security audit of 2026-10-22 (finding F1) showed that a session created by
`POST /api/setup` was never revoked. Setup can run more than once while no
passkey exists. Someone who had `SETUP_TOKEN` and an `ADMIN_EMAILS` address
before the owner set up could run setup, keep the session cookie, and wait.
After the owner registered a passkey for the same address, that old session
passed `requireAdmin`, because the check was "this user has a passkey", not
"this session came from a passkey". A variant: a setup session for a second
allowed address could register a passkey after setup had closed and so create
another admin.

## Decision

- `createFirstAdmin` deletes every session of a reused user before it
  creates the new one (`internalAdapter.deleteUserSessions`).
- The passkey plugin's `registration.afterVerification` hook calls
  `beforePasskeySaved()` (`src/features/setup/first-passkey.ts`):
  - a user who already has a passkey may add another, but only from a
    session created at or after that user's first passkey (the same rule as
    `requireAdmin`; 401 otherwise);
  - a user without a passkey gets 403 when setup is closed;
  - otherwise this is the first passkey. The hook claims setup with one
    conditional statement, `INSERT INTO settings (key, value) VALUES
    ('setup_closed_at', now) ON CONFLICT DO NOTHING RETURNING value`
    (`claimSetup()`, through Drizzle). D1 runs statements one at a time, so
    of any number of overlapping registrations exactly one inserts the row;
    the others get 403. Only the claimant continues, and it then deletes
    every session in the database. Before the claim no passkey existed, so
    the only sessions are the ones setup created.
- If the claimant's passkey is not saved (the insert fails after the claim),
  an after hook on `/passkey/verify-registration` releases the claim, so the
  owner is not locked out. The release is one guarded statement:
  `DELETE FROM settings WHERE key = 'setup_closed_at' AND value = <this
  claim> AND NOT EXISTS (SELECT 1 FROM passkey)`. It cannot reopen setup
  after any passkey was saved, and it cannot remove another request's claim.
  The claim is kept per request, keyed by Better Auth's request context
  object, which the passkey hook and the after hook share.
- `createFirstAdmin` checks that setup is open, creates the session, and then
  checks again. If setup closed in between, it deletes the new session and
  answers 403 without a cookie. Either the setup session is inserted before
  the claimant deletes every session (and is deleted with them), or it is
  inserted after the claim, and the second check sees the claim.
- The setup UI registers the first passkey with `createSession: true`. The
  passkey plugin then creates a new session after it saves the passkey, so
  the owner stays signed in.
- `requireAdmin` accepts a session only when it was created at or after the
  user's first passkey (`session.created_at >= min(passkey.created_at)`).
  Otherwise it answers 401, so the admin UI goes to sign-in. Sessions from a
  passkey sign-in and from the first registration pass; a session from setup
  never does.
- `ADMIN_EMAILS` is still read on every request, so a removed address is
  locked out at its next request.

Tests run Better Auth's real registration and sign-in endpoints with a
software WebAuthn authenticator (`src/testing/soft-authenticator.ts`), and the
end-to-end test runs the same flow in Chromium. The race tests
(`src/features/setup/setup-race.http.test.ts`) pause chosen statements in the
test D1 stand-in (`pauseAt` in `src/testing/sqlite-d1.ts`) to interleave two
first-passkey registrations, and a setup request with a registration, at the
points that matter.

## Alternatives considered

- **Mark each session with how it was created.** A Better Auth
  `additionalFields` column on `session` (for example `auth_method`) would
  state "created by passkey sign-in" directly. Rejected: it changes a table
  that the Better Auth CLI generates, so every Better Auth upgrade would have
  to carry the extra field, and it needs a migration. The time comparison
  needs no schema change.
- **Only delete sessions, without the time check in `requireAdmin`.** The
  time check also covers sessions that a future code path forgets to delete,
  so it stays as defense in depth.
- **Check that setup is open, then delete sessions (the first version of
  this decision).** The check and the passkey insert were separate steps.
  Two overlapping first-passkey registrations could both pass the check, and
  a setup request between the delete and the passkey insert could keep a
  session that passed `requireAdmin`. The post-fix verification of
  2026-10-22 reproduced this with a delayed insert. The atomic claim
  replaces it.
- **Expire a stale claim after a timeout instead of releasing it.** A claim
  row looks the same as the row the trigger writes, so a timeout would also
  reopen setup on a site whose passkeys were all deleted. Rejected.

## Consequences

- Registering the first passkey signs out every other browser. Before setup
  closes, those can only be setup sessions, so nothing of value is lost.
- A second admin cannot be added after setup has closed. The docs say so.
- Passkey rows without `created_at` do not count for `requireAdmin`; the
  passkey plugin always sets it.
- The known gap recorded by the first version of this decision (closing
  setup was not atomic) is closed by the claim, the second check in
  `createFirstAdmin`, and the session-time rule for added passkeys.
- If the Worker stops between the claim and the passkey insert (for example
  it hits the CPU limit), the after hook does not run and setup stays closed
  with no passkey. Recovery is manual: when the `passkey` table is empty,
  delete the `setup_closed_at` row from `settings` with
  `wrangler d1 execute`, then run setup again.
