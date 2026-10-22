# Architecture

This document describes the planned architecture of goodnight-web. Most of it
is not implemented yet (milestone M1). Decisions that still need a proof of
concept are marked as open and will be recorded in
[decisions/](decisions/README.md).

## Constraints

- One Worker and one D1 database per site.
- External services are Cloudflare and GitHub only. Slack is an optional
  notification target, not a requirement.
- No Queues, Cron Triggers, or KV. Work that would normally run on a schedule
  runs inside requests instead.
- Fail closed: a missing setting disables the feature that needs it.

## Runtime

```
              visitors                              admins
                 │                                     │
                 ▼                                     ▼
 ┌──────────────────────────── one Worker ────────────────────────────┐
 │ Static Assets: the Astro build (/, /blog/*, /contact, ...)          │
 │ run_worker_first: /api/* (and /admin/* if the admin UI needs it)    │
 │ Hono app from createGoodnightWorker(options)                        │
 │   POST /api/contact   contact form submissions                      │
 │   /api/setup          first admin, closes after use                 │
 │   /api/auth/*         Better Auth, passkeys only                    │
 │   /api/admin/*        list, detail, status, delete, CSV export      │
 │   /admin/*            prebuilt admin UI (React SPA)                 │
 └─────────────────────────────────────────────────────────────────────┘
        │ D1: submissions, settings, Better Auth tables
        │ Rate Limiting binding, Turnstile siteverify
        └─ ctx.waitUntil ─▶ Slack incoming webhook (optional, no personal data)
```

- **Static Assets** serve every public page without running the Worker. Only
  `/api/*` (and possibly `/admin/*`) reach Hono.
- **Hono** routes the API. The app factory takes options from the site (for
  example the contact categories) and reads bindings and secrets from `env`.
- **Better Auth** is created per request from the env bindings. Email and
  password sign-in is disabled; admins use passkeys.
- **D1** stores submissions, settings, and the Better Auth tables. The
  migrations ship inside `@goodnight-web/server`.

### Secrets and bindings

| Name                 | Kind               | Purpose                                             |
| -------------------- | ------------------ | --------------------------------------------------- |
| `DB`                 | D1 binding         | All persistent data                                 |
| rate limit binding   | Rate Limiting      | Limits contact submissions per `ip_hash`            |
| `SETUP_TOKEN`        | secret             | Required to create the first admin                  |
| `ADMIN_EMAILS`       | secret or variable | Allowlist of addresses that may become admins       |
| `BETTER_AUTH_SECRET` | secret             | Better Auth signing secret                          |
| `IP_HASH_SECRET`     | secret             | HMAC key for `ip_hash`                              |
| `TURNSTILE_SECRET`   | secret             | Turnstile siteverify; contact API is off without it |
| `SLACK_WEBHOOK_URL`  | secret, optional   | New-inquiry notification                            |

## Contact flow

`POST /api/contact` runs these steps in order:

1. Check `Origin`, `Content-Type`, and the body size (about 16 KB). Reject
   anything else.
2. If the honeypot field is filled, save the submission with status `held` and
   return success, so a bot learns nothing.
3. Verify the Turnstile token with siteverify, including `hostname` and
   `action`. On failure return 400 and save nothing.
4. Apply the Rate Limiting binding with `ip_hash` as the key. Over the limit
   returns 429.
5. Validate the input with zod and compute a spam score. A score over the
   threshold sets the status to `held`.
6. Insert the row into D1, then return 200. The response does not depend on
   anything after this step.
7. In `ctx.waitUntil`:
   - if the status is `new` and a webhook is configured, post "1 new inquiry,
     category, admin URL" to Slack and set `notified_at`;
   - if `settings.last_cleanup_at` is more than one hour old, delete rows older
     than the retention period (180 days by default) and update
     `last_cleanup_at`. Opening the admin list runs the same cleanup, so old
     rows are removed even when no new inquiries arrive.

If `TURNSTILE_SECRET` is not set, the endpoint returns 503 and the form shows
that it is not available yet.

`ip_hash` is `HMAC-SHA256(ip, IP_HASH_SECRET)`. The raw IP is never stored or
logged.

## Admin

- Setup: `/api/setup` accepts a request only with the correct `SETUP_TOKEN` and
  an email in `ADMIN_EMAILS`. It creates the first admin and registers a
  passkey, then closes for good.
- Screens: setup, passkey registration, sign-in, inquiry list (50 per page,
  unread count always in the header), and detail (status change between
  `new`, `read`, `done`, `held`, `spam`, and delete). CSV export is in the API.
- The admin UI is a React SPA built with Vite, Base UI, shadcn, and Tailwind
  v4. It ships prebuilt in `@goodnight-web/server` with Japanese and English
  strings. The SPA shell may load without a session, but every data request
  needs one.
- Open question: deliver the admin UI as static assets copied into the site
  build (needs `@goodnight-web/astro`), or embed it in the Worker.

## Package and starter

The code is split by who edits it.

**`@goodnight-web/server` (and the optional `@goodnight-web/astro`)** hold the
parts users should not edit: the Worker factory, the contact API, auth, the
admin API and UI, security headers, and migrations. They follow semver.

**`templates/starter`** is the part users own: Astro pages, Markdown content in
Content Collections (ja and en), `site.config.ts`, styles, a `src/worker.ts`
of about three lines that calls `createGoodnightWorker()`, `wrangler.jsonc`,
and `AGENTS.md` / `CLAUDE.md` that tell AI tools which files to edit.

In this repository the starter depends on `@goodnight-web/server` through
`workspace:*`. When the starter is copied out for users (planned for M2), that
dependency is replaced with the published exact version.

## How updates reach users

1. We release a patch of `@goodnight-web/server` (with a security advisory if
   it fixes a vulnerability).
2. The starter ships a `.github/dependabot.yml` that groups `@goodnight-web/*`
   updates with a cooldown. Dependabot opens one pull request in the user's
   repository. Security updates are not delayed by the cooldown.
3. The user's CI or Workers Builds builds the pull request and shows a preview.
4. The user merges the pull request. The deploy script runs
   `wrangler d1 migrations apply DB --remote && wrangler deploy`, so migrations
   are applied before the new code runs.

What remains for the site owner: reviewing and merging these pull requests,
updating the starter's own dependencies (Astro, Tailwind, and so on, also
through Dependabot), and following Cloudflare changes such as
`compatibility_date`.

There is no one-click update from the admin screen. It would require giving
the Worker a token that can write to GitHub.

## Development repository

- Bun workspaces: `apps/*`, `packages/*`, `templates/*`.
- Turborepo runs `build`, `type-check`, `test`, and `deploy:check` in each
  workspace that defines them. `deploy:check` runs `wrangler deploy --dry-run`
  for the starter and the docs site.
- Oxlint and Oxfmt run once from the root.
- CI runs install with a frozen lockfile, lint, format check, type check,
  tests, build, and `deploy:check`.
- Dependencies use exact versions and a 48-hour release-age gate
  (`bunfig.toml`); Dependabot uses a two-day cooldown.
