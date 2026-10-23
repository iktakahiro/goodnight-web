# 0010. One APP_SECRET for the setup token, the session key, and the IP hash key

- Status: accepted
- Date: 2026-10-23

## Context

A new site had to set four values before it could run: `SETUP_TOKEN`,
`ADMIN_EMAILS`, `BETTER_AUTH_SECRET`, and `IP_HASH_SECRET`. The Deploy to
Cloudflare form asks for each of them, and three are random strings of 32
characters or more that the owner has to generate and paste one by one. Many
people stop at that form. Only `ADMIN_EMAILS` carries information the owner
has to decide; the three secrets only need to be random and different from
each other.

Sites that already run with the four variables must keep working: the same
session signing key (or every admin is signed out), the same IP hash key (or
rate limits and stored `ip_hash` values change), and the same setup rules.

## Decision

- **A new secret, `APP_SECRET`**, at least 32 characters, checked with the
  same `secretState` rules as the other secrets. A site needs only
  `APP_SECRET` and `ADMIN_EMAILS` among the secrets.
- **Derived keys.** When `BETTER_AUTH_SECRET` or `IP_HASH_SECRET` is unset
  or empty, its key is derived from `APP_SECRET` with HKDF-SHA-256
  (RFC 5869) through Web Crypto (`crypto.subtle.deriveBits`):
  - input key material: `APP_SECRET` as UTF-8;
  - salt: empty. RFC 5869 then uses a string of 32 zero bytes. A salt adds
    strength when the input key material is not uniformly random but is the
    same for every derivation; here there is one input and nowhere to keep a
    per-site salt except next to the secret, so a fixed salt would add
    nothing that the labels do not;
  - `info`: a fixed label per purpose, `goodnight-web:better-auth` and
    `goodnight-web:ip-hash` (`APP_SECRET_LABELS`);
  - output: 32 bytes, written as 64 lowercase hex characters, so a derived
    key passes the same length check as a key set by hand.

  A known-answer test, computed with Python's `hmac` module and with
  `openssl kdf`, catches any change to the algorithm, salt, labels, or
  encoding.

- **Setup token.** When `SETUP_TOKEN` is unset or empty, `POST /api/setup`
  accepts `APP_SECRET` (the same constant-time compare). When `SETUP_TOKEN`
  is set, only it is accepted. `GET /api/setup` returns `tokenName` (the
  variable name, never a value) so the setup screen can say which one to
  enter.
- **Precedence.** A variable that is set always wins and is checked as
  before. A set value that is too short is never replaced by a derived one;
  it keeps the feature off and is reported under its own name. An
  `APP_SECRET` shorter than 32 characters fills nothing in, so the features
  stay off exactly as when the individual secrets are missing (fail closed).
- **Reporting.** `GET /api/setup` (`problems`), `GET /api/admin/status`
  (`contactMissing`, `contactTooShort`), and the 503 messages name
  `APP_SECRET` when a secret is neither set nor filled in, because setting
  `APP_SECRET` is the fix. Names only, never values.
- **Where it runs.** The first middleware of `createGoodnightWorker`
  replaces `c.env` with a resolved view of `env`
  (`resolveAppSecret` in `packages/server/src/shared/app-secret.ts`), and
  every route keeps reading `c.env`. The view is one object per `env` object
  and `APP_SECRET` value, so the Better Auth instance cache keyed by `env`
  ([0001](0001-passkey-auth-on-workers.md)) still hits, and a changed
  `APP_SECRET` gets a new Better Auth instance. Other properties are read
  from `env` on every access. Deriving the two keys runs once per isolate.

## Why the setup token may be APP_SECRET

`APP_SECRET` is already the root of the session signing key. Anyone who
knows it can sign a session cookie for any user, which is more than setup
gives. Accepting it as the setup token therefore gives an attacker who has
it nothing new. Setup still requires an address in `ADMIN_EMAILS`, still
closes once the first passkey is registered
([0006](0006-admin-sessions-and-setup-closure.md)), and is still rate-limited
per `ip_hash`.

The owner types `APP_SECRET` into the setup screen once. A browser or
password manager may offer to save it. An owner who does not want the root
secret in a browser can set `SETUP_TOKEN` as well; then only `SETUP_TOKEN` is
accepted.

## Why APP_SECRET must stay after setup

With the four variables, `SETUP_TOKEN` could be deleted after setup. With
`APP_SECRET`, the session key and the IP hash key come from it:

- Removing it turns sign-in, the admin API, setup, and the contact API off
  (503), unless `BETTER_AUTH_SECRET` and `IP_HASH_SECRET` are set by hand.
- Changing it changes both derived keys. Every admin is signed out (their
  session cookies no longer verify) and must sign in again with a passkey.
  New `ip_hash` values differ from the stored ones, and rate limit counters
  start over. Passkeys, inquiries, and settings are not affected.

Passkey recovery (reopening setup by clearing `session`, `passkey`, and
`settings.setup_closed_at` in D1) works the same: setup then accepts
`APP_SECRET`, or `SETUP_TOKEN` if the owner sets it for the recovery.

## Alternatives considered

- **Keep four required values.** Rejected: it is the reason people stop at
  the Deploy form.
- **Generate the secrets on first request and store them in D1.** Rejected:
  a secret in the database is readable by anyone who can read the database
  (exports, backups, the D1 console), and AGENTS.md forbids writing secrets
  to D1. It would also need a race-free first write.
- **Have the Deploy form generate the values.** Not possible: the Deploy
  to Cloudflare form does not generate secret values, so the owner would
  still paste three of them.
- **Use `APP_SECRET` directly for the session key and the IP hash key.**
  Rejected: one leaked key would then expose the other purpose, and the two
  values would be equal. HKDF with distinct labels gives independent keys;
  knowing one derived key gives no way to compute `APP_SECRET` or the other
  key.
- **`HMAC-SHA256(APP_SECRET, label)` instead of HKDF.** It would work for 32
  bytes, but HKDF is the standard construction for this and is available in
  Web Crypto, so there is no custom scheme to review.
- **Derive the setup token from `APP_SECRET` too.** Rejected: the owner
  could not compute it without a tool, and it would protect nothing that
  `APP_SECRET` does not already control.
- **Fall back to `APP_SECRET` when a set value is too short.** Rejected: it
  would hide a misconfiguration and silently change the key of a site that
  meant to set its own.

## Consequences

- A new site sets `ADMIN_EMAILS` and `APP_SECRET` (plus the Turnstile keys
  for the contact form). The starter and the user documentation change to
  this once a server version with this change is published.
- Sites with the four variables keep the same keys, sessions, IP hashes, and
  setup token. Adding `APP_SECRET` to such a site changes nothing while the
  three variables stay set; removing `SETUP_TOKEN` then makes `APP_SECRET`
  the setup token.
- `APP_SECRET` must not be deleted or changed casually; the documentation
  must say so where it tells the owner to delete `SETUP_TOKEN`.
- The derivation labels, salt, and encoding are part of the stored data's
  contract: changing them has the same effect as changing `APP_SECRET`.
