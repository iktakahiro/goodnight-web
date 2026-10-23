# goodnight-web development

goodnight-web is an open-source template for a company website with a blog and
a contact form. It runs on Cloudflare only: one Worker with Static Assets and
one D1 database. The only external services are Cloudflare and GitHub. Do not
add Queues, Cron Triggers, KV, or any required third-party service.

- Write source code, comments, developer documentation, issues, commit
  messages, and PR titles and bodies in English. `README.ja.md` is the only
  Japanese file for repository management.
- Use Bun for package management, scripts, and tests. Use Turborepo to
  orchestrate workspace tasks, Oxlint for linting, Oxfmt for formatting, and
  TypeScript in strict mode.
- Keep dependencies on exact versions and commit `bun.lock` with the change.
- Preserve the 48-hour release-age gate in `bunfig.toml` and the matching
  two-day cooldown in `.ncurc.json` and `.github/dependabot.yml`. Do not bypass
  the gate or add exclusions without explicit maintainer approval.
- Pin GitHub Actions by full commit SHA with the version in a trailing comment.
- Use the workspace's pinned `wrangler`. Local work uses `wrangler dev` and
  local D1 only. Never log in to Cloudflare, deploy, or apply remote migrations
  from an agent session; use `wrangler deploy --dry-run` to check a build.
- Do not mention other CMS products by name in the repository. Describe what
  goodnight-web does, and be honest about the maintenance that remains
  (reviewing and merging dependency update PRs).
- Write documentation in plain, concrete sentences. No slogans or hype.

## Layout

The planned layout. Some workspaces do not exist yet. See
[docs/architecture.md](docs/architecture.md) for the rationale.

- `packages/server` (`@goodnight-web/server`): the Hono app factory
  `createGoodnightWorker(options)`, the contact API, Better Auth with passkeys,
  the admin API, security headers, D1 migrations, and the prebuilt admin UI
  with its ja/en strings. Users install it and never edit it.
- `packages/typescript-config` (`@goodnight-web/typescript-config`): shared
  `tsconfig` presets (`base.json`, `react.json`).
- `templates/starter`: the Astro site that users copy and edit, usually with AI
  tools. It pins `@goodnight-web/server` to an exact version: bun links the
  workspace package here, and a copy of the folder installs it from npm. Bump
  both versions together (`bun run check:release`).
- `apps/docs`: the user-facing documentation site (Fumadocs and TanStack Start,
  prerendered and served by Workers Static Assets).
- `brand/`: the logo, favicon, and app icon files. `bun run brand:build`
  regenerates them, and the copies in the admin UI and the docs site, from
  `brand/scripts/logo.ts`. Do not edit the generated files by hand.
- `docs/`: contributor and maintainer documentation. Record design decisions
  in [docs/decisions/](docs/decisions/README.md). Publishing the server
  package is described in [docs/releasing.md](docs/releasing.md).

## Languages

- Everything user-facing is bilingual, Japanese (`ja`) and English (`en`): the
  admin UI, the starter site, and the documentation site.
- Add or change a string in both languages in the same change. Keep a Japanese
  page in step with its English page, with the same slug and the same code
  blocks.
- The admin UI picks the language from the browser and offers a manual switch.

## Security rules

These rules are part of the product. Do not weaken them to make a feature or a
test easier.

- Never store a raw IP address. Store only `HMAC-SHA256(ip, IP_HASH_SECRET)`,
  where `IP_HASH_SECRET` is the set value or, when it is unset, the key
  derived from `APP_SECRET` (docs/decisions/0010). Do not log raw IPs either.
- Fail closed. When a required setting or secret is missing, disable the
  feature instead of running without it. For example, without
  `TURNSTILE_SECRET` the contact API returns 503 and the form says it is not
  available yet.
- The admin UI and the admin API never work without authentication. There is
  no development bypass, default account, or shared key. Better Auth with
  passkeys is always required, even when Cloudflare Access is also used.
- The first admin can be created only with the setup token and an address in
  `ADMIN_EMAILS`. The setup token is `SETUP_TOKEN` when it is set, otherwise
  `APP_SECRET`; never both. Setup closes once an admin exists.
- Derive keys from `APP_SECRET` only with HKDF-SHA-256 and a fixed label per
  purpose (`src/shared/app-secret.ts`). A variable that is set always wins
  over a derived key, and a set value that is too short is never replaced. An
  `APP_SECRET` shorter than 32 characters fills nothing in. Do not change a
  label: it signs every admin out and changes every IP hash.
- Save a contact submission to D1 before responding. Notifications and cleanup
  run in `ctx.waitUntil` and never change the response.
- Slack notifications contain no personal data and no form values: only the
  site name, the path of the page the form was on, the received time, and
  the admin URL. Suspected spam is never notified.
- Do not drop doubtful submissions. A filled honeypot or a spam score of
  `SPAM_SUSPECT_THRESHOLD` or more stores the submission with
  `suspected_spam = 1`; it is not a status. Store nothing before Turnstile
  passes, and give a honeypot hit the same response as the same request
  without it (docs/decisions/0009).
- Validate contact submissions against the form definition stored in D1,
  never against one sent by the client. Reject unknown field keys.
- Verify Turnstile on the server, including `hostname` and `action`. Check
  `Origin` and the body size before parsing.
- Keep secrets in Worker secrets. Never return them, or keys derived from
  them, to the browser, and never write them to D1 or logs. Problem lists
  name variables only.

## Database

D1 is accessed through Drizzle ORM only (see
[docs/decisions/0005](docs/decisions/0005-drizzle-orm.md)).

- Use the Drizzle query builder (`getDatabase(env.DB)`) for every query.
  Never call D1's `prepare()` or reach the binding through `$client`. Raw SQL
  goes only through Drizzle's `sql` template, which binds interpolated
  values. Never use `sql.raw()`. `bun run check:sql` enforces this outside
  test helpers.
- Validate numbers from requests (page, limit) as bounded integers with zod
  at the route, and pass them to `.limit()` and `.offset()`.
- A `LIKE` search binds the whole pattern as one parameter, escapes `%`,
  `_`, and `\` with `escapeLike()`, and adds `ESCAPE '\'`. The admin list
  searches the email column only and sorts by `created_at` only.
- Schema change workflow: edit `packages/server/src/db/schema.ts`, run
  `bun run db:generate` (drizzle-kit generate), read the generated SQL, and
  commit it with the schema. `bun run db:check` fails when the schema and the
  migrations differ.
- Never edit, rename, or delete a migration that has been released. Fix
  mistakes with a new migration.
- Keep schema changes additive (new tables and columns). Sites apply
  migrations before `wrangler deploy`, so the previous Worker version runs
  against the new schema for a short time.
- If the generated SQL rebuilds the `passkey` table, append the
  `CREATE TRIGGER` statement from `0002_setup_closed_trigger.sql` to the new
  file. If it rebuilds the `user` table, do not commit it: on D1 the rebuild
  deletes every session and passkey. Change the schema so that it needs only
  `ALTER TABLE ... ADD`.
- `form_definitions` is append-only: the triggers `form_definitions_no_update`
  and `form_definitions_no_delete` in `0004_form_definition_seed.sql` refuse
  `UPDATE` and `DELETE`. Never change or delete a saved form version; add a
  new one. If the generated SQL rebuilds `form_definitions`, append both
  `CREATE TRIGGER` statements to the new file.
- Data and triggers that drizzle-kit does not model go in a custom migration
  (`bunx drizzle-kit generate --custom --name <name>` in `packages/server`).
- Better Auth tables come from the Better Auth CLI
  (`packages/server/scripts/auth-schema.config.ts`). Regenerate that part of
  `schema.ts` after a Better Auth upgrade instead of editing it by hand.

## Code organization

- Organize code by feature, not by technical category. Keep code in its owning
  feature and promote it to a shared location only when it is domain-neutral.
- Use kebab-case file and directory names, except framework-required route
  names.
- Do not use `any`. Narrow `unknown` at the boundary where data enters.
- Prefer static imports. A dynamic import needs a comment that states why.
- Do not add barrel files. A package entry point is the only re-exporting
  module.
- Write English TSDoc for every exported function, class, type, and constant.
  Describe the contract: purpose, non-obvious parameters and results, and
  thrown errors. The packages are a public interface, so the documentation is
  part of it.
- Use other comments only for intent or constraints the code cannot show.
- Build Better Auth and other objects that need bindings or secrets from the
  request's `env`, never at module top level. Better Auth may be cached per
  isolate, keyed by the `env` object (and origin), so a new `env` gets a new
  instance (see docs/decisions/0001).

## Validation

Run `bun run validate` and `bun run build` for every implementation change.
`validate` runs lint, format, type checks, `check:sql`, `db:check`, and the
tests.
Run `bun run deploy:check` when a change touches a Worker, `wrangler.jsonc`, or
D1 migrations.

Use Bun's built-in test runner and co-locate tests as `*.test.ts` or
`*.test.tsx`. Test observable behavior and contracts, not implementation
details. Cover the security rules above with tests as the features are built.

## Git

- Use English Conventional Commits and keep commits small and meaningful.
- Work on a feature branch. Never push to `main`, force-push, or merge a PR
  unless the maintainer asks.
- Do not publish npm packages, create repositories, or change repository
  visibility.
