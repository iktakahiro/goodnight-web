# 0001. Passkey sign-in with Better Auth on Workers and D1

- Status: accepted
- Date: 2026-10-22

## Context

Admins sign in with passkeys only. Email and password sign-in is disabled.
The auth code must run in one Worker with D1, and the auth instance is built
from the request's env bindings. The first admin is created with the
`SETUP_TOKEN` secret and an address in `ADMIN_EMAILS`, and setup closes once an
admin exists.

Open questions before this spike:

- Does the full passkey flow (registration and sign-in) work on workerd with
  D1, in a real browser?
- With email and password disabled, how does the first user get a session so
  that it can register a passkey?
- What breaks on `localhost`, what does `nodejs_compat` change, how large is
  the bundle, and which parts cost CPU?

## What we tested

Versions (all older than the 48-hour release-age gate):

| Package                                | Version                        |
| -------------------------------------- | ------------------------------ |
| `better-auth`                          | 1.7.11                         |
| `@better-auth/passkey`                 | 1.7.11                         |
| `@simplewebauthn/server` (via passkey) | 13.3.3                         |
| `auth` (the Better Auth CLI)           | 1.7.11                         |
| `hono`                                 | 4.13.13                        |
| `wrangler`                             | 4.151.2 (workerd 1.20261019.1) |
| `playwright`                           | 1.64.1 (Chromium build 1248)   |
| `compatibility_date` / flags           | 2026-10-15, `nodejs_compat`    |

Setup:

- A Hono Worker with Static Assets (`run_worker_first: ["/api/*"]`), a local
  D1 database, and `betterAuth()` built per request with
  `database: env.DB`, `emailAndPassword: { enabled: false }`, and the passkey
  plugin (`rpID` = request hostname, `origin` = request origin,
  `authenticatorSelection: { residentKey: "required", userVerification: "required" }`).
- A small Better Auth plugin with one endpoint for the first admin (details
  below). Hono's `POST /api/setup` forwards to it with
  `auth.api.setupStart({ body, headers, asResponse: true })`.
- A browser page bundled from `better-auth/client` and
  `@better-auth/passkey/client`.
- A Playwright script that drives Chromium with the Chrome DevTools Protocol
  virtual authenticator: `WebAuthn.enable`, then
  `WebAuthn.addVirtualAuthenticator` with `protocol: "ctap2"`,
  `transport: "internal"`, `hasResidentKey: true`,
  `hasUserVerification: true`, `isUserVerified: true`,
  `automaticPresenceSimulation: true`.

Commands (local only):

```sh
auth generate --config auth.cli.ts --output migrations/0001_better_auth.sql --yes
wrangler d1 migrations apply DB --local
wrangler dev --port 8811 --ip 127.0.0.1
node e2e.mjs http://localhost:8811
wrangler deploy --dry-run --outdir dist-dry
```

## Results

### The full flow works

All 12 checks in the script passed in Chromium against `wrangler dev` and
local D1. The flow:

- `GET /api/me` returns 401 before setup.
- Setup with a wrong token returns 403.
- Setup with the right token and an allowlisted address (mixed case) creates
  the user and a session cookie, and the session works.
- `passkey.addPasskey()` registers a passkey. The virtual authenticator holds
  one resident credential with `rpId: "localhost"`.
- Setup returns 403 once a passkey exists.
- Sign-out ends the session.
- `signIn.passkey()` with no email typed (discoverable credential) signs in as
  `admin@example.com`.
- After another sign-out, conditional UI (`signIn.passkey({ autoFill: true })`
  with an input that has `autocomplete="username webauthn"`) also signs in.

The stored row in `passkey` had `deviceType: singleDevice`, `backedUp: 0`,
`transports: internal`.

The flow also passed with `nodejs_compat` removed (see below).

### Creating the first admin

Better Auth has no public "create a user and a session" API when email and
password are disabled. The working approach is a Better Auth plugin endpoint,
so that the session cookie is created and signed by Better Auth itself:

1. Check `SETUP_TOKEN` with a constant-time compare
   (`crypto.subtle.timingSafeEqual`).
2. Check the address against `ADMIN_EMAILS` (trimmed, lowercased).
3. Refuse if any row exists in `passkey` ("setup closed").
4. `ctx.context.internalAdapter.findUserByEmail()` or `createUser()` with
   `emailVerified: true`, then `createSession(user.id)`.
5. `setSessionCookie(ctx, { session, user })` from `better-auth/cookies`.

The browser then calls `passkey.addPasskey()`. The passkey plugin's default
`registration.requireSession: true` and its `freshSessionMiddleware` accept
this new session.

Setup is closed by "a passkey exists", not "a user exists". If the person
leaves before registering a passkey, they can run setup again.

Better Auth 1.7 also supports passkey-first registration
(`registration.requireSession: false`, `resolveUser`, and `createSession` on
verify). We did not use it. It opens the registration endpoints to callers
without a session, and the setup context would be sent as a `?context=` query
parameter, which ends up in URLs and logs.

### Gotchas

- **Use `localhost`, not `127.0.0.1`.** At `http://127.0.0.1:8811`,
  registration fails with `ERROR_INVALID_DOMAIN` ("127.0.0.1 is an invalid
  domain") because WebAuthn does not accept an IP address as the RP ID.
  `wrangler dev` prints `Ready on http://127.0.0.1:...`, so the docs must say
  to open `http://localhost:<port>`.
- **A passkey is tied to the hostname.** A passkey registered on `localhost`
  or `*.workers.dev` does not work on a custom domain.
- **Better Auth's origin check needs cookies.** A `POST` with
  `Origin: https://evil.example` and no cookie was accepted by the setup
  endpoint. The same request with any cookie was rejected with
  `INVALID_ORIGIN`. Server-side `auth.api.*` calls skip the check. So
  `/api/setup` must check `Origin` itself, like `/api/contact`.
- **User verification is not enforced by default.** The passkey plugin calls
  SimpleWebAuthn with `requireUserVerification: false` for both registration
  and sign-in, and always asks for `userVerification: "preferred"` at sign-in.
  Only registration options can be changed. We added
  `registration.afterVerification` and `authentication.afterVerification`
  hooks that reject when `userVerified` is false. The normal flow passes with
  the hooks. We could not test the rejection path: Chromium's virtual
  authenticator cancels the ceremony itself before an assertion without user
  verification reaches the server.
- **The schema CLI moved.** `@better-auth/cli` is deprecated on npm. The CLI is
  now the `auth` package. It needs a real SQLite connection:
  `--adapter kysely --dialect sqlite` without a database fails with "Only
  kysely adapter is supported for migrations", and `better-sqlite3` 13.0.3
  failed to build on Node 24 here. A config with
  `new DatabaseSync(":memory:")` from `node:sqlite` works and emits the five
  tables (`user`, `session`, `account`, `verification`, `passkey`) and five
  indexes. See [0002](0002-migrations-from-package.md).
- **`nodejs_compat`.** The bundle builds and the full flow passes with or
  without the flag. The only `node:` import in the bundle is `node:crypto` from
  `@better-auth/utils/password.node.mjs` (scrypt for passwords, which we do not
  use).
- **Leftover rows.** An unfinished ceremony leaves a row in `verification`
  after it expires; Better Auth never deletes it on the paths we use.
  (Update, 2026-10-22: the hourly `pruneIfDue()` now deletes expired
  `verification` rows.)

### Bundle size

`wrangler deploy --dry-run --outdir`: **2,535.07 KiB, 464.16 KiB gzip**
(Hono, Better Auth, the passkey plugin, and the setup plugin). The browser
client (`better-auth/client` + `passkeyClient`) is 48.6 KB minified, 16 KB
gzip.

### CPU

`wrangler dev` cannot report Worker CPU time. We read the CPU time of the local
workerd processes (`/proc/<pid>/stat`) around 200 requests sent from Chromium.
The numbers include workerd's own HTTP handling and the local D1 engine, which
run in the same processes. Treat them as rough upper bounds on one development
machine:

| Request                                            | CPU per request |
| -------------------------------------------------- | --------------- |
| Static asset (no Worker)                           | 2.9 ms          |
| Worker, plain text response                        | 3.1–4.9 ms      |
| Worker, one D1 query                               | 4.4–4.7 ms      |
| Worker, only `betterAuth()` construction           | 5.1–6.0 ms      |
| `getSession` (new auth instance per request)       | 10.8–11.6 ms    |
| `getSession` (auth instance reused in the isolate) | 5.9 ms          |
| Passkey sign-in (options + verify), per request    | 15.8–16.5 ms    |
| Sign-out                                           | 8.8–10.0 ms     |

`wrangler check startup` showed 41–63 ms of startup CPU locally, mostly module
evaluation of Better Auth.

What costs CPU:

- **Building `betterAuth()` on every request** is the largest avoidable cost.
  Reusing the instance cut `getSession` from about 11 ms to about 6 ms here.
  The `env` object was the same object across requests in one isolate.
- **The verify endpoints** decode CBOR and check the signature (WebCrypto,
  native code), and run several D1 queries (challenge lookup and delete,
  passkey lookup, counter update, session insert). Attestation is `none`, so
  no certificate chain is parsed.
- **Every admin API call** looks up the session in D1.
- No password hashing runs.

## Decision

- Use `better-auth` and `@better-auth/passkey` (exact versions) with
  `database: env.DB` and email and password disabled. Keep `nodejs_compat`.
- Create the first admin with a Better Auth plugin endpoint as tested above.
  `/api/setup` forwards to it. It checks `Origin`, compares `SETUP_TOKEN` in
  constant time, checks `ADMIN_EMAILS` case-insensitively, and closes once the
  first passkey is registered. A `passkey` insert trigger records
  `settings.setup_closed_at`, so deleting every passkey later does not reopen
  setup. The browser then calls `passkey.addPasskey()`.
- The admin API requires a session whose user has at least one passkey. The
  session from setup is only useful for registering the first passkey.
- Ask for resident keys and user verification at registration, and reject
  `userVerified: false` in both `afterVerification` hooks.
- The sign-in screen offers a "Sign in with passkey" button (discoverable
  credential) and conditional UI on an input with
  `autocomplete="username webauthn"`.
- Ship the Better Auth tables as a static migration generated by the `auth`
  CLI ([0002](0002-migrations-from-package.md)).
- Document that local development uses `http://localhost:<port>`, and that
  admins should register passkeys after the final domain is set.

## Open issues

- CPU time on Cloudflare is not measured. The free plan allows 10 ms of CPU
  per request; the local upper bounds above are close to that. Measure with
  Workers observability (`cpuTime`) on a real deployment (M2).
- `AGENTS.md` says to build Better Auth per request and not keep it in module
  scope. The data suggests caching it per isolate (keyed by the `env` object
  and origin) saves about 5 ms per request. Decide whether to change the rule.
- Not tested: `session.cookieCache` to skip the D1 session lookup.
- Not tested: rejecting an assertion without user verification (see above).
- `rpID` and `origin` come from the request. If both `*.workers.dev` and a
  custom domain are enabled, each hostname gets its own passkeys. Decide
  whether to pin the admin origin with a variable.
- Passkey recovery (lost device) is still open (PRD #2).

## Update (2026-10-22): cache the auth instance per isolate

Decided by the dev lead after the spike review, for the second open issue
above. Building `betterAuth()` on every request cost about 5 ms of CPU
locally, which is too close to the free plan's 10 ms limit.

- `@goodnight-web/server` builds the Better Auth instance from the env
  bindings and caches it per isolate, in a `WeakMap` keyed by the `env`
  object, with one instance per request origin (the passkey `rpID` and
  `origin` come from it). If the runtime passes a different `env` object, a
  new instance is built, so changed bindings or secrets are picked up.
- Nothing is built at module top level, and no secret is read outside a
  request.
- `AGENTS.md` now states this rule instead of "create per request".
- The instance also sets `advanced.ipAddress.disableIpTracking: true`, so
  Better Auth does not write the client IP into `session.ipAddress` (the "no
  raw IP" rule), and `telemetry.enabled: false`.
