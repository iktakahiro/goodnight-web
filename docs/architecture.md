# Architecture

This document describes the architecture of goodnight-web. Milestone M1 is in
progress: `@goodnight-web/server` (contact API, setup, passkey auth, admin API,
admin UI, migrations) and the documentation site are implemented; the starter
is not yet. Design decisions are recorded in
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
 │ run_worker_first: /api/*, /admin, /admin/*                          │
 │ Hono app from createGoodnightWorker(options)                        │
 │   /api/contact        form config (GET) and submissions (POST)      │
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
  `/api/*`, `/admin`, and `/admin/*` reach Hono (`run_worker_first`). The
  bare `/admin` must be listed: `/admin/*` does not match it.
- **Hono** routes the API. `createGoodnightWorker(options)` takes options
  from the site (locale, contact categories, Turnstile hostnames) and reads bindings and secrets from `env` on every request.
  Requests it does not handle go to the `ASSETS` binding.
- **Better Auth** is built from the env bindings and cached per isolate,
  keyed by the `env` object and the request origin. A new `env` object (new
  bindings or secrets) gets a new instance. Building it costs about 5 ms of
  CPU, which is too much to repeat on every request on the free plan
  ([0001](decisions/0001-passkey-auth-on-workers.md)). Email and password
  sign-in is disabled; admins use passkeys. IP tracking is off, so the
  `session.ip_address` column stays empty. That also turns off Better Auth's
  own rate limiter, so the Worker limits the public sign-in endpoints
  (`passkey/generate-authenticate-options` and
  `passkey/verify-authentication`) itself, with the key `auth:<ip_hash>` on
  the Rate Limiting binding. Over the limit returns 429; without the binding
  or `IP_HASH_SECRET` they return 503.
- **D1** stores submissions, settings, and the Better Auth tables. All of
  them are defined in one Drizzle schema
  (`packages/server/src/db/schema.ts`). Every query goes through the Drizzle
  query builder; Better Auth uses its Drizzle adapter with the same schema.
  drizzle-kit generates the SQL migrations from the schema, and they ship
  inside `@goodnight-web/server`
  ([0002](decisions/0002-migrations-from-package.md),
  [0005](decisions/0005-drizzle-orm.md)). See "Database" below.

### Secrets and bindings

| Name                   | Kind               | Purpose                                                    | When missing                   |
| ---------------------- | ------------------ | ---------------------------------------------------------- | ------------------------------ |
| `DB`                   | D1 binding         | All persistent data                                        | Worker cannot run              |
| `ASSETS`               | Static Assets      | The site's pages                                           | non-API paths return 404       |
| `CONTACT_RATE_LIMITER` | Rate Limiting      | Contact, setup, and passkey sign-in requests per `ip_hash` | contact, setup, sign-in 503    |
| `SETUP_TOKEN`          | secret             | Required to create the first admin                         | setup 503                      |
| `ADMIN_EMAILS`         | secret or variable | Comma-separated addresses that may be admins               | setup 503, admin API 403       |
| `BETTER_AUTH_SECRET`   | secret             | Better Auth signing secret, 32 characters or more          | auth, setup, and admin API 503 |
| `IP_HASH_SECRET`       | secret             | HMAC key for `ip_hash`                                     | contact, setup, sign-in 503    |
| `TURNSTILE_SECRET`     | secret             | Turnstile siteverify                                       | contact API 503                |
| `TURNSTILE_SITE_KEY`   | variable (public)  | Turnstile widget; the form reads it from the config API    | contact API 503                |
| `SLACK_WEBHOOK_URL`    | secret, optional   | New-inquiry notification; only `https://hooks.slack.com/…` | no notification                |

The Rate Limiting binding name is fixed
([0003](decisions/0003-rate-limit-binding.md)). The admin API reports which
contact settings are missing (names only, never values) in
`GET /api/admin/status`.

## Contact flow

The contact form first calls `GET /api/contact/config`. It returns
`available`, the public Turnstile site key, the Turnstile action
(`contact`), the honeypot field name (`website`), and the allowed categories.
When `available` is `false`, the form shows that it is not available yet.

`POST /api/contact` runs these steps in order
(`packages/server/src/features/contact/contact-routes.ts`):

0. If `TURNSTILE_SECRET`, `TURNSTILE_SITE_KEY`, `IP_HASH_SECRET`, or the
   `CONTACT_RATE_LIMITER` binding is missing, return 503
   (`contact_unavailable`) without reading the body.
1. Check that `Origin` is the Worker's own origin, that `Content-Type` is
   JSON, and that the body is at most 16 KB. The size is checked against
   `Content-Length` and again while reading, so a chunked body cannot bypass
   it. Errors: 403, 415, 413, then 400 for bad JSON. The form is served by the
   same Worker, so the API is same-origin only and sends no CORS headers.
2. If the honeypot field is filled, save the submission with status `held` and
   return success, so a bot learns nothing. This path also counts against the
   rate limit; over the limit it still returns success but saves nothing, so a
   bot cannot fill the database.
3. Verify the Turnstile token with siteverify (secret, token, `remoteip`),
   and check that `hostname` is the request's hostname (or one of
   `options.contact.turnstileHostnames`) and that `action` is `contact`. On
   failure return 400 (`turnstile_failed`) and save nothing.
4. Apply the Rate Limiting binding with `ip_hash` as the key. Over the limit
   returns 429.
5. Validate the input with the zod schema exported from
   `@goodnight-web/server/contact` (control characters removed, lengths
   checked, `consent` must be `true`). A category outside the values of
   `options.contact.categories` is rejected; labels are only for the admin
   UI. Then compute the spam score; a
   score of 3 or more sets the status to `held`.
6. Insert the row into D1, then return 200. If the insert fails, return 500.
   The response does not depend on anything after this step.
7. In `ctx.waitUntil`:
   - if the status is `new` and `SLACK_WEBHOOK_URL` is a Slack webhook URL,
     post "1 new inquiry, category, admin URL" to Slack and set
     `notified_at`. The category is shown only when it is one of the
     configured categories, so free text from a visitor never reaches Slack.
     There is no retry; the unread count in the admin UI covers missed
     notifications.
   - prune old rows (see below).

`ip_hash` is `HMAC-SHA256(ip, IP_HASH_SECRET)` of `CF-Connecting-IP`. The raw
IP is sent to Turnstile siteverify but never stored or logged.

Error responses are `{ "error": { "code", "message", "fields"? } }`. The
message is Japanese or English depending on `Accept-Language`. The browser
helper `submitContact()` in `@goodnight-web/server/client` returns these as
typed results instead of throwing.

### Spam score

`scoreSubmission()` in `spam-score.ts`. The rules only hold a submission for
review; nothing is thrown away.

| Rule           | Points                    | Condition                                            |
| -------------- | ------------------------- | ---------------------------------------------------- |
| `links:N`      | N, at most 3              | links (`http://`, `https://`, `www.`) in the message |
| `link_in_name` | 3                         | a link in the name or company                        |
| `too_fast`     | 3                         | sent less than 3 seconds after the form was shown    |
| `honeypot`     | always `held`, not scored | the hidden `website` field is filled                 |

### Retention without Cron

`pruneIfDue()` deletes submissions older than `settings.retention_days`
(180 by default) at most once an hour. It claims the run with one conditional
upsert of `settings.last_cleanup_at`, so two requests at the same time do not
both delete. It runs in `ctx.waitUntil` after each submission and after each
admin list request, so old rows are removed even when no new inquiries
arrive.

## Admin

### Setup

`POST /api/setup` with `{ token, email, name? }`
(`packages/server/src/features/setup/`):

1. 503 without `BETTER_AUTH_SECRET`, `SETUP_TOKEN`, `ADMIN_EMAILS`,
   `IP_HASH_SECRET`, or the `CONTACT_RATE_LIMITER` binding. Setup never runs
   without its attempt limit.
2. 403 unless `Origin` is the Worker's origin. Better Auth skips its own
   origin check for server-side calls, so the route checks it.
3. 429 over the rate limit (`setup:<ip_hash>` on the same binding).
4. 403 `setup_closed` once a passkey was ever registered.
5. 403 `invalid_setup_token` unless the token matches `SETUP_TOKEN`
   (constant-time compare).
6. 403 `email_not_allowed` unless the address is in `ADMIN_EMAILS`
   (case-insensitive).
7. A server-only Better Auth plugin endpoint creates the user (or reuses it)
   and sets the session cookie. It is not reachable under `/api/auth/*`.

The browser then registers a passkey with the Better Auth passkey client.
Setup closes when the first passkey is registered, so a person who left before
registering one can run setup again. A trigger on the `passkey` table records
`settings.setup_closed_at` in the same transaction, so setup stays closed even
if every passkey is deleted later (migration `0002_setup_closed_trigger.sql`). `GET /api/setup` returns `{ configured, open }`.

### Admin API

Every `/api/admin/*` route requires a Better Auth session whose user is still
in `ADMIN_EMAILS` and has at least one passkey. The session from setup alone
only allows registering the first passkey. State-changing requests also need
the Worker's own `Origin` (CSRF). There is no development bypass.

| Route                                             | Result                                                                                                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/admin/me`                               | the signed-in admin                                                                                                                                          |
| `GET /api/admin/status`                           | `turnstileConfigured`, `contactAvailable`, `contactMissing`, `slackConfigured`, `version`, `retentionDays`, `unreadCount`, `categories` (`{ value, label }`) |
| `GET /api/admin/submissions?status=&page=&limit=` | `limit` per page (1–100, default 50), newest first, `total` and `unreadCount`; runs pruning. Invalid `status`, `page`, or `limit` is 400                     |
| `GET /api/admin/submissions/:id`                  | one submission; a `new` one becomes `read`                                                                                                                   |
| `PATCH /api/admin/submissions/:id`                | `{ status }`: `new`, `read`, `done`, `held`, or `spam`                                                                                                       |
| `DELETE /api/admin/submissions/:id`               | deletes the row                                                                                                                                              |
| `GET /api/admin/submissions.csv?status=`          | CSV with a UTF-8 BOM; cells starting with `= + - @`, tab, or CR get a leading `'`                                                                            |

`ip_hash` is never returned by the admin API.

### Admin UI

The admin UI is a React SPA in `packages/server/admin-ui/`, built with Vite,
Base UI, shadcn-style components (the component source is copied into
`admin-ui/src/shared/ui/` and adapted to Base UI, as shadcn does), Tailwind
v4, and lucide icons. It ships prebuilt inside `@goodnight-web/server` and is
served by the Worker ([0004](decisions/0004-admin-ui-delivery.md)).

The UI uses three TanStack libraries, all in the browser only:

- **TanStack Router** for typed, code-based routes under the basepath
  `/admin` (`admin-ui/src/app-router.tsx`). The basepath is a URL rewrite
  rather than the router's `basepath` option, which would write the list as
  `/admin/`. There is no route generator, so the build is plain
  `vite build`. Search parameters are validated with zod
  schemas; a value that is not valid falls back to the default instead of
  showing an error. Unknown paths show the not-found screen.
- **TanStack Form** for the setup and sign-in forms. The setup form validates
  with `setupInputSchema`, the same zod schema `POST /api/setup` uses (it is
  exported from `@goodnight-web/server`). zod's English messages are not
  shown; the UI maps each error to `field.required`, `field.invalid`, or
  `field.too_long` in the UI's language.
- **TanStack Table** (headless) for the inquiry list. Pagination and sorting
  are manual: the API returns one page of 50, sorted by received date, newest
  first. The API has no other order, so the sort is fixed. The rows keep
  their list design (one link per inquiry) instead of a `<table>`.

The UI does not use TanStack Start; the Worker serves the static build.

| Path                    | Screen                                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `/admin/setup`          | First admin: setup token and email (`POST /api/setup`), then passkey registration, then done                                            |
| `/admin/login`          | Passkey sign-in: a button, and passkey autofill (conditional UI) where the browser supports it                                          |
| `/admin`                | Inquiry list: status tabs (all, new, read, done, on hold, spam), 50 per page, newest first, CSV export; `?status=&page=` keep the state |
| `/admin/inquiries/<id>` | Detail: message, contact details, status change, reply by email, delete with a confirmation dialog                                      |

- **Session.** Before the list or detail screen loads, a route guard (the
  router's `beforeLoad`) calls `GET /api/admin/me` and remembers the admin
  until sign-out or a 401. Without a session (401) it redirects to
  `/admin/setup` while setup is open, and otherwise to
  `/admin/login?next=<path>`. After sign-in the user returns to
  `next`, so the link in a Slack notification (`/admin/inquiries/<id>`) works
  when signed out. `next` must be an `/admin` path. A session without a
  passkey (403 `passkey_required`) goes to the passkey step of setup. There
  is no client-side bypass: the API decides.
- **Header.** The unread count from `GET /api/admin/status` (and from each
  list response) is always shown, with the language switch, the light/dark
  switch, and sign-out.
- **Setup notices.** When `turnstileConfigured` is `false`, the list and
  detail screens show a notice that the contact form is not accepting
  submissions, with a link to the Turnstile setup page in the documentation.
  The documentation origin is one constant, `DOCS_BASE_URL` in
  `admin-ui/src/shared/docs-links.ts` (`https://goodnight-web.invalid` until
  the site has a domain). Other missing contact settings are listed by name.
  When Slack is not configured, the list shows a quieter note that can be
  dismissed.
- **Languages.** The UI picks Japanese or English from `navigator.languages`;
  the header switch saves the choice in `localStorage`. Strings shared with
  the API and the contact form (errors, statuses, field names) come from
  `@goodnight-web/server/messages`; strings used only by the UI are in
  `admin-ui/src/shared/i18n/admin-messages.ts`. API errors are shown with
  the `error.<code>` message in the UI's language. Dates use `Intl` in the
  viewer's time zone.
- **Theme.** A fixed deep navy-violet theme, separate from the starter's
  colors (the starter owns its colors in `site.config.ts` and
  `src/styles/global.css`). All colors are tokens in `admin-ui/src/styles.css`:
  light values in `@theme`, dark values under `:root.dark`; components use
  only token classes. `theme-contrast.test.ts` reads that file and checks
  WCAG AA for the main pairs in both modes (4.5:1 text, 3:1 control borders
  and focus rings).
- **Light and dark mode.** The default follows `prefers-color-scheme`. The
  header switch (system, light, dark) saves the choice in `localStorage`
  (`goodnight-web.admin.theme`). To avoid a flash of the wrong colors,
  `index.html` loads `admin-ui/public/theme-init.js` as a blocking script in
  `<head>`; it sets the `dark` class on `<html>` before the CSS and the app
  load. It is a file, not an inline script, so the CSP stays
  `script-src 'self'` with no hash or `'unsafe-inline'`. The same rules are
  in `admin-ui/src/shared/theme/color-scheme.ts`; a unit test runs the
  script against them, and the end-to-end test checks the class when
  `#root` is parsed.
- **CSP.** Every admin response gets the admin CSP
  (`default-src 'self'; script-src 'self'; style-src 'self'; ...`). The
  build has no inline scripts or styles. Base UI's one inline `<style>`
  element is turned off (`CSPProvider disableStyleElements`) and its rule is
  in `styles.css`. A test checks the built `index.html`, and the end-to-end
  test fails on any CSP violation.
- **Build.** `bun run build` in `packages/server` runs `vite build` into
  `admin-ui/dist` and then `scripts/build-admin-module.ts`, which writes
  `src/features/admin-ui/admin-files.gen.ts` (path, content type, ETag,
  body). The generated file is not committed. Turborepo builds it before
  `type-check`, `test`, and `deploy:check` of the server package. The bundle
  is one JS file of about 260 kB gzip and one CSS file of about 8 kB gzip.
  With it, `deploy:check` reports the server's test Worker at about
  2,990 KiB (680 KiB gzip).
- **Serving.** `/admin` and paths without a file extension return
  `index.html` (`no-cache`); `/admin/assets/*` are immutable; ETags give
  304s. The SPA shell loads without a session, but every data request needs
  one.

### Security headers

Responses from `/api/*` and `/admin/*` get `X-Content-Type-Options`,
`X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`,
`Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, a
`Permissions-Policy`, and HSTS on HTTPS. API responses get
`default-src 'none'` and `Cache-Control: no-store`. Pages from Static Assets
are not changed.

## Database

| Table                                                   | Contents                                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `submissions`                                           | contact submissions; `status` is checked against the five statuses; `ip_hash`, never an IP |
| `settings`                                              | `retention_days`, `last_cleanup_at`, `setup_closed_at`                                     |
| `user`, `session`, `account`, `verification`, `passkey` | Better Auth, generated by the Better Auth CLI for the Drizzle adapter                      |

- **Queries.** `getDatabase(env.DB)` (`src/db/database.ts`) returns the
  Drizzle database. App code never calls D1's `prepare()`; raw SQL appears
  only as Drizzle `sql` template fragments, which bind their values. The
  admin list passes the validated `limit` and offset to `.limit()` and
  `.offset()`, so they are bound too. `scripts/check-sql.ts` fails on
  `sql.raw(`, `.prepare(`, and `$client` in `packages/server` outside test
  helpers.
- **Migrations.** `bun run db:generate` writes
  `packages/server/migrations/NNNN_name.sql` and drizzle-kit's
  `migrations/meta/`. Wrangler reads only the `.sql` files, sorted by name.
  The default settings and the `passkey_closes_setup` trigger are custom
  migrations, because drizzle-kit does not model data or triggers.
  `bun run db:check` fails when the schema has changes without a migration.
  The package ships the `.sql` files without `meta/`.
- **Rebuilds.** For some changes drizzle-kit rebuilds a table. Rebuilding
  `passkey` drops the trigger, and rebuilding `user` deletes every session
  and passkey on D1, because D1 keeps foreign keys on. A test fails on
  `DROP TABLE user`, and `AGENTS.md` has the rules
  ([0005](decisions/0005-drizzle-orm.md)).
- **Logs.** A failed Drizzle query carries its bound values in its message.
  Errors are logged with `safeErrorMessage()` only. Better Auth's logger
  logs redacted messages, and Better Auth rethrows endpoint errors to the
  app's `onError` instead of logging them itself, so no submitted values or
  tokens reach the logs ([0005](decisions/0005-drizzle-orm.md)).

## Package and starter

The code is split by who edits it.

**`@goodnight-web/server`** holds the parts users should not edit: the Worker
factory, the contact API, auth, the admin API and UI, security headers, and
migrations. It follows semver. No `@goodnight-web/astro` package is needed
for the admin UI ([0004](decisions/0004-admin-ui-delivery.md)).

Entry points (`exports` in `packages/server/package.json`):

| Import                           | Contents                                                               |
| -------------------------------- | ---------------------------------------------------------------------- |
| `@goodnight-web/server`          | `createGoodnightWorker`, env and option types, admin API types         |
| `@goodnight-web/server/contact`  | zod schemas, field limits, Turnstile action, honeypot name, spam rules |
| `@goodnight-web/server/client`   | `getContactConfig()` and `submitContact()` for the browser (no zod)    |
| `@goodnight-web/server/messages` | ja/en message catalogs, `translate()`, `pickLocale()`                  |
| `migrations/`                    | D1 migrations, read through `migrations_dir`                           |

**`templates/starter`** is the part users own: Astro pages, Markdown content in
Content Collections (ja and en), `site.config.ts`, styles, a `src/worker.ts`
of about three lines that calls `createGoodnightWorker()`, `wrangler.jsonc`,
and `AGENTS.md` / `CLAUDE.md` that tell AI tools which files to edit. It also
ships GitHub files: a Dependabot config, an Update check workflow that marks
official `@goodnight-web/*` update pull requests, and a Visibility check
workflow that fails while the repository is public. See
[starter.md](starter.md).

In this repository the starter depends on `@goodnight-web/server` through
`workspace:*`. Its contact form uses `getContactConfig()` and
`submitContact()` and gets the Turnstile site key from the config API. When the starter is copied out for users (planned for M2), that
dependency is replaced with the published exact version.

## How updates reach users

1. We release a patch of `@goodnight-web/server` (with a security advisory if
   it fixes a vulnerability).
2. The starter ships a `.github/dependabot.yml` that groups `@goodnight-web/*`
   updates with a cooldown. Dependabot opens one pull request in the user's
   repository. Security updates are not delayed by the cooldown. The
   starter's Update check workflow comments whether the pull request is an
   official update, and the starter's README tells users to merge only those.
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
  the SQL guard (`check:sql`), the migration check (`db:check`), tests,
  build, and `deploy:check`. `bun run validate` runs the same checks except
  build and `deploy:check`. A separate `e2e` job builds and runs the
  end-to-end tests of `packages/server` and `templates/starter` with
  Playwright Chromium, and uploads screenshots and traces when they fail.
- Dependencies use exact versions and a 48-hour release-age gate
  (`bunfig.toml`); Dependabot uses a two-day cooldown.
- `bunfig.toml` pins `linker = "isolated"`, so each workspace gets its own
  `node_modules` link to `@goodnight-web/server` and the starter's
  `migrations_dir` path works
  ([0002](decisions/0002-migrations-from-package.md)).

## Tests

- `bun test` in `packages/server` runs the unit and HTTP tests. HTTP tests
  call the Hono app with an in-memory D1 stand-in on `bun:sqlite` with the
  real migrations (`src/testing/sqlite-d1.ts`), a counting stand-in for the
  Rate Limiting binding, and stubs for Turnstile siteverify and Slack. Better
  Auth runs for real against the stand-in. The security rules in `AGENTS.md`
  have tests: fail-closed 503s, Origin and size checks, Turnstile hostname and
  action, rate limits, no raw IP in any table, no personal data in Slack,
  setup closing, 401/403 on every admin route, and CSV escaping. SQL
  injection has tests at two levels: the admin list route rejects malicious
  `status`, `page`, and `limit` values with 400, and
  `submission-store.test.ts` records the statements sent to D1 and checks
  that input appears only in the bound parameters. `src/db/migrations.test.ts`
  checks the migration file names, the drizzle-kit journal, and the trigger.
- `bun run test:e2e` in `packages/server` is the end-to-end test. It applies
  the migrations to a fresh local D1 (`.wrangler/e2e-state`), starts
  `wrangler dev` with `e2e/wrangler.jsonc` on port 8790 (`E2E_PORT` to
  change), and drives the real admin UI in Chromium with a CDP virtual
  authenticator: contact POST and the row in D1; setup with a wrong token, an
  address outside `ADMIN_EMAILS`, and the right input; passkey registration;
  sign-out; passkey sign-in with the button and with autofill; the list, the
  detail, and a status change; a deep link while signed out; the language
  switch; and delete with confirmation. It also checks the API rules the UI
  relies on and fails on any CSP violation. The test Worker stubs Turnstile
  siteverify, so it calls no Cloudflare service. It needs
  `bunx playwright install chromium`. Buttons, labels, and headings are found
  by role and by strings from the admin message catalog, so copy edits do not
  break the test. CI runs it in the `e2e` job.
- `bun run screenshots <dir>` in `packages/server` takes screenshots of the
  admin UI in Japanese and English with fictional sample inquiries, using the
  same local setup.
- `bun test` also runs the admin UI's unit tests (`admin-ui/src/**/*.test.ts`):
  language detection, date and number formatting, routes and the `next`
  parameter, list query parsing, and the message catalogs.
- `bun run test:e2e` in `templates/starter` runs the starter against
  `wrangler dev` with Cloudflare's Turnstile test keys: pages, the
  not-available state and 503, a form submission saved to D1, then the admin
  UI in a real browser: setup, passkey registration, sign-out, passkey
  sign-in, the inquiry in the list with its category label, the detail, and a
  status change. See [starter.md](starter.md#end-to-end-test).
- `deploy:check` for the server package runs `wrangler deploy --dry-run` on
  the e2e Worker to check that the package bundles for Workers.

## Documentation site

`apps/docs` (`@goodnight-web/docs`, private) is the user-facing documentation.
It follows the same setup as the calendarpit documentation site:

- Fumadocs with TanStack Start. Every page is prerendered to static HTML; the
  server bundle is deleted after the build.
- A static-assets-only Worker serves `apps/docs/dist` (`wrangler.jsonc`: no
  `main`, `html_handling: force-trailing-slash`, `not_found_handling:
  404-page`, `workers_dev` and `preview_urls` off). There is no custom domain
  yet.
- English is at the root and Japanese under `/ja/`, with the same slugs. The
  landing page is `/` (and `/ja/`); the documentation is under `/docs/` (and
  `/ja/docs/`). Pages live in `apps/docs/src/content/docs/`.
- The build also writes `llms.txt`, `llms-full.txt`, and one Markdown file per
  page for AI tools.
- `bun run test` in the workspace runs `scripts/check-static.ts` on the build:
  one `h1` per page, `lang`, canonical and `hreflang` URLs, internal links and
  anchors, local assets only, and identical code blocks in both languages.
- `DOCS_SITE_URL` sets the origin for canonical URLs. Until a domain is chosen
  it defaults to `https://goodnight-web.invalid`.

Mark anything not tested end to end with a "Draft / not verified yet" callout.
