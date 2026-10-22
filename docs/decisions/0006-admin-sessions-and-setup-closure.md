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
  - a user who already has a passkey may add another;
  - a user without a passkey gets 403 when setup is closed;
  - otherwise this is the first passkey, which closes setup, so every
    session in the database is deleted. Before the first passkey, the only
    sessions are the ones setup created.
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
end-to-end test runs the same flow in Chromium.

## Alternatives considered

- **Mark each session with how it was created.** A Better Auth
  `additionalFields` column on `session` (for example `auth_method`) would
  state "created by passkey sign-in" directly. Rejected: it changes a table
  that the Better Auth CLI generates, so every Better Auth upgrade would have
  to carry the extra field, and it needs a migration. The time comparison
  needs no schema change.
- **Only delete sessions, without the time check in `requireAdmin`.** The
  delete runs in the registration hook, before the plugin inserts the
  passkey. A setup request that lands between the two would create a session
  that survives. The time check rejects such a session when it is older than
  the passkey, and it also covers sessions that a future code path forgets to
  delete. It does not close the window completely (see Consequences).

## Consequences

- Registering the first passkey signs out every other browser. Before setup
  closes, those can only be setup sessions, so nothing of value is lost.
- A second admin cannot be added after setup has closed. The docs say so.
- Passkey rows without `created_at` do not count for `requireAdmin`; the
  passkey plugin always sets it.
- Known gap (found by the post-fix verification of 2026-10-22). Closing setup
  is not atomic: the hook deletes sessions and checks that setup is open
  before the passkey row is written. A `POST /api/setup` that lands inside
  that window can still create a session that passes `requireAdmin`, and two
  first-passkey registrations for different allowed addresses that overlap
  can both succeed. It needs `SETUP_TOKEN` before setup closes and timing
  within the owner's registration request; the verifier reproduced it only
  with an artificially delayed insert. A follow-up should claim
  `setup_closed_at` atomically before deleting sessions, re-check it after
  setup creates its session, and apply the session-time rule when a user who
  already has a passkey registers another.
