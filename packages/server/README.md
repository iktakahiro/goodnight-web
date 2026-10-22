# @goodnight-web/server

The server side of a goodnight-web site: one Hono app for a Cloudflare Worker
with the contact API, first-admin setup, passkey sign-in (Better Auth), the
admin API, the prebuilt admin UI, security headers, and the D1 migrations.

Sites use it from `src/worker.ts` and do not edit it:

```ts
import { createGoodnightWorker } from '@goodnight-web/server';

export default createGoodnightWorker({ locale: 'ja' });
```

Options: `locale` (`ja` or `en`: Slack messages, CSV headers when none is
asked for, and API messages when `Accept-Language` matches neither) and
`contact.turnstileHostnames` (hostnames accepted from Turnstile siteverify;
defaults to the request's hostname).

The contact form fields are not options. Admins edit them in the admin UI
(**Form**), and each save is a new, append-only version in the
`form_definitions` table. The email address and the privacy consent are
fixed. Submissions store the values by immutable field id with the form
version, so old inquiries keep their own labels. The documentation site's
"Customizing the contact form" page describes the rules.

`wrangler.jsonc` needs:

- `assets.run_worker_first: ["/api/*", "/admin", "/admin/*"]`
- a D1 binding `DB` with
  `"migrations_dir": "node_modules/@goodnight-web/server/migrations"`
- a Rate Limiting binding `CONTACT_RATE_LIMITER`
- the variable `TURNSTILE_SITE_KEY` and the secrets `SETUP_TOKEN`,
  `ADMIN_EMAILS`, `BETTER_AUTH_SECRET`, `IP_HASH_SECRET`, `TURNSTILE_SECRET`,
  and optionally `SLACK_WEBHOOK_URL`

A feature whose settings are missing is turned off: for example, the contact
API answers 503 until Turnstile is set up.

Endpoints:

- `GET /api/contact/form`: the current form fields, the form version, and
  whether the form is available (public, cached for 30 seconds).
- `POST /api/contact`: `{ email, consent, fields, formVersion, locale,
  turnstileToken, gnw_hp_x, elapsedMs, pagePath }`. `fields` is validated
  against the current definition in D1; unknown keys are 400, an old
  `formVersion` is 409 `form_outdated`. A filled honeypot (`gnw_hp_x`) or a
  spam score of 3 or more stores the submission as suspected spam, with no
  Slack notification.
- `/api/setup`, `/api/auth/*`: first-admin setup and Better Auth.
- `/api/admin/*` (admin session with a passkey): status, the inquiry list
  (views `unread`, `read`, `all`, `spam`; email search `q`; filters
  `version`, `field` + `value`; sorted by received time, `dir`), detail
  (marks it read), unread/read and suspected spam changes, delete, and CSV
  export.
- `/api/admin/form`: `GET` the current definition and history, `PUT` a new
  version (`{ baseVersion, fields }`, 409 `form_conflict` when someone saved
  first), `GET /versions/:version`, and
  `POST /versions/:version/restore`.

The contact form uses `@goodnight-web/server/client` (`getContactForm()`,
`submitContact()`). `@goodnight-web/server/contact` has the request schema,
the form definition types and limits, and `buildFieldValuesSchema()`. Japanese and English strings are in
`@goodnight-web/server/messages`. The admin UI strings, as JSON, are in
`@goodnight-web/server/admin-messages.json`; a site's end-to-end test reads
button names and headings from it.

See `docs/architecture.md` in the repository for the request flows and the
security rules.

## Database

All tables (contact submissions, form definitions, settings, and the Better
Auth tables) are
defined with Drizzle ORM in `src/db/schema.ts`. drizzle-kit generates the SQL
migrations in `migrations/`, and the package ships those `.sql` files. A site
applies them with `wrangler d1 migrations apply DB` (the starter's deploy
script runs it with `--remote` before `wrangler deploy`). Do not run
`wrangler d1 migrations create`: it would write into `node_modules`.

## Development

The admin UI source is in `admin-ui/`: a Vite-built React SPA with Base UI,
Tailwind v4, TanStack Router (typed code-based routes under `/admin`, search
parameters validated with zod), TanStack Form (setup and sign-in; the setup
form uses the exported `setupInputSchema`), and TanStack Table (the inquiry
list, with server-side pagination, sorting by the fixed columns, and column
visibility saved in the browser; and the form editor). It does not use TanStack Start.
`bun run build` builds it and embeds it in
`src/features/admin-ui/admin-files.gen.ts`, and writes the admin UI strings
to `src/features/admin-ui/admin-messages.gen.json`. Neither file is
committed. Run the
build before `type-check` or `test` when you call them directly in this
directory (Turborepo does it for you from the repository root).

Schema changes: edit `src/db/schema.ts`, run `bun run db:generate`, read the
generated SQL, and commit it. Never edit a released migration. The rules for
table rebuilds, the setup trigger, and the `form_definitions` triggers are in the repository's `AGENTS.md` and
`docs/decisions/0005-drizzle-orm.md`.

```sh
bun run db:generate  # drizzle-kit generate: new migration from src/db/schema.ts
bun run db:check     # fails when src/db/schema.ts has changes without a migration
bun run build        # builds admin-ui/ and writes the two .gen files
bun run test         # unit and HTTP tests (in-memory D1 stand-in) and admin UI unit tests
bun run test:e2e     # wrangler dev + the admin UI in Chromium with passkeys; needs `bunx playwright install chromium`
bun run screenshots <dir>  # admin UI screenshots with fictional sample data
bun run deploy:check
```
