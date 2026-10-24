# Starter (`templates/starter`)

The starter is the Astro site that users copy and own. This document is for
maintainers. The user-facing rules are in the starter's own `AGENTS.md` and
`README.md`.

The starter pins `@goodnight-web/server` to an exact version
(`"@goodnight-web/server": "0.9.2"`). In this repository bun links the
workspace package when the version equals the one in
`packages/server/package.json`. While a new server version waits to be
published, the pin stays one release behind and bun installs that published
version from npm instead ([releasing.md](releasing.md)). When the folder is
copied out alone, the same line installs the package from npm.
`bun run check:release` fails if the pin is newer than the server version. Its `src/worker.ts` calls `createGoodnightWorker()`, and `wrangler.jsonc` has the
bindings the server needs.

The starter stays on TypeScript 6 because `astro check` needs its compiler
API. Upgrade it when Astro supports TypeScript 7.1 or later through
`@astrojs/ts-content-mapper`.

## Layout

| Path                                     | Contents                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| `site.config.ts`                         | Company details (including the contact email), nav, locales, theme colors      |
| `src/worker.ts`                          | The `createGoodnightWorker()` call                                             |
| `wrangler.jsonc`                         | Assets, `run_worker_first`, `DB`, `CONTACT_RATE_LIMITER`, `TURNSTILE_SITE_KEY` |
| `.dev.vars.example`                      | Every secret with a comment; the Deploy button reads it                        |
| `e2e/`                                   | End-to-end test (`run.ts`) and the test-only Worker (`worker.ts`)              |
| `src/pages/[...lang]/`                   | Every localized page, built once per locale                                    |
| `src/pages/404.astro`                    | One 404 page with all languages                                                |
| `src/content/{news,blog,pages}/<ja,en>/` | Markdown content, one folder per locale                                        |
| `src/features/contact/`                  | Contact form markup and its browser script                                     |
| `src/features/posts/`                    | News and blog lists, detail page, and collection helpers                       |
| `src/components/ui/`                     | Small shadcn-style components written as `.astro` files                        |
| `src/components/site/`                   | Header, footer, language switcher, page header                                 |
| `src/i18n/`                              | Locale helpers and shared UI strings                                           |
| `.github/`                               | Dependabot config, Update check and Visibility check workflows                 |

There is no React in the starter. The only browser scripts are the mobile
menu toggle and the contact form script. Base UI or React islands should be
added only when a page needs real interactivity.

## Languages and routing

- `site.config.ts` sets `locales` and `defaultLocale` (Japanese by default,
  because most users are Japanese companies). The default locale is served
  at `/`, the others under `/<locale>/`. Astro's `i18n` config uses the same
  values with `prefixDefaultLocale: false`.
- Pages live in `src/pages/[...lang]/`. `getStaticPaths` returns
  `lang: undefined` for the default locale and the locale code for the
  others, so changing `defaultLocale` needs no file moves.
- Each page keeps both languages in one `text` object. This keeps ja and en
  next to each other, which makes it harder for an editor (or an AI tool) to
  change one and forget the other.
- `trailingSlash: 'always'` matches the directory-style output and Workers
  Static Assets' default HTML handling.
- The 404 page shows every language because a static 404 cannot know the
  visitor's language.

## Worker and bindings

- `src/worker.ts` passes `locale: siteConfig.defaultLocale` to
  `createGoodnightWorker()`. The contact form fields (including the category
  options) are not in the starter: admins edit them in the admin UI, and the
  server stores them in D1
  ([0008](decisions/0008-contact-form-definition-in-d1.md)).
- `wrangler.jsonc`: `main: src/worker.ts`, `compatibility_date` 2026-10-15
  with `nodejs_compat` (as in the server's e2e config), assets from `./dist`
  with `binding: ASSETS`, `not_found_handling: 404-page`, and
  `run_worker_first: ["/api/*", "/admin", "/admin/*"]`
  ([0004](decisions/0004-admin-ui-delivery.md)); D1 `DB` with
  `migrations_dir: node_modules/@goodnight-web/server/migrations`
  ([0002](decisions/0002-migrations-from-package.md)); the Rate Limiting
  binding `CONTACT_RATE_LIMITER` (5 per 60 s, namespace `1001`,
  [0003](decisions/0003-rate-limit-binding.md)); and the variable
  `TURNSTILE_SITE_KEY`, empty by default.
- `workers_dev: true` and `preview_urls: false`, both explicit. A new site
  has no custom domain, so workers.dev is the only way to reach `/admin` for
  setup. After a custom domain is attached, the owner sets
  `"workers_dev": false` in the file and commits: wrangler 4.151.3 turns
  workers.dev on at every deploy when the config has no routes and the key is
  unset, so a dashboard toggle does not last. Preview URLs give each
  uploaded version a public address that shares the production D1 and
  secrets; when the key is unset Cloudflare enables them whenever workers.dev
  is on. With them off, a pull request that Workers Builds builds (if the
  owner keeps non-production branch builds on) gets a build result but no
  public address. Owners review an update with the Update check comment and
  status, the build result, and `npm run preview` locally.
- `public/_headers` gives the static pages a Content Security Policy
  (`script-src 'self' https://challenges.cloudflare.com`, `frame-src` the
  same Turnstile origin, `connect-src 'self'`, `style-src 'self'`,
  `style-src-attr 'unsafe-inline'` for the theme colors set as a `style`
  attribute on `<html>`, `object-src 'none'`, `base-uri 'self'`,
  `form-action 'self'`, `frame-ancestors 'none'`), `nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy`, and `Permissions-Policy`. No
  HSTS: that is left to the zone. Workers Static Assets applies it to asset
  responses only; the Worker's own headers cover `/api/*` and `/admin*`.
  `astro.config.ts` sets `build.inlineStylesheets: 'never'` and
  `vite.build.assetsInlineLimit: 0`, so Astro writes every script to
  `/_astro/` and the policy needs no `'unsafe-inline'` for scripts (a static
  file cannot carry per-page hashes). The starter e2e test checks the header
  on `/` under `wrangler dev` and that the contact page with Turnstile logs
  no CSP violation; `scripts/static-headers.test.ts` checks the file.
- The D1 binding has no `database_id`. `wrangler dev`, `d1 migrations apply
  --local`, and `deploy --dry-run` work without it. Cloudflare creates the
  database and writes the ID when the Deploy button first deploys the site.
- Secrets (`APP_SECRET`, `ADMIN_EMAILS`, `TURNSTILE_SECRET`, optional
  `SLACK_WEBHOOK_URL`) are listed with comments in `.dev.vars.example`. The
  Deploy button reads the secrets for its form from that file (Cloudflare:
  "Worker secrets can be defined in a `.dev.vars.example` or `.env.example`
  file with a dotenv format"), so only uncommented keys belong there. The
  optional `ACCESS_AUD`, `ACCESS_TEAM_DOMAIN`, and the separate-key overrides
  `SETUP_TOKEN`, `BETTER_AUTH_SECRET`, and `IP_HASH_SECRET`
  ([0010](decisions/0010-single-app-secret.md)) are commented out, so the
  form does not ask for them. `package.json` `cloudflare.bindings` has a
  short English Markdown description for each secret, variable, and binding,
  for the Deploy button form (English only: the form has no language switch).
  Keep each one to 150 characters or fewer.
  Cloudflare's documentation names no limit, but in the real form (reported
  2026-10-23) descriptions of 193 and 196 characters showed and those of 257
  or more did not.
- Scripts: `deploy` is `wrangler d1 migrations apply DB --remote && wrangler
  deploy`; `deploy:check` is `wrangler deploy --dry-run` (CI runs it through
  `turbo run deploy:check`); `preview` builds, applies migrations locally,
  and runs `wrangler dev`.

## Contact form

- The page shows a loading state. The script
  (`src/features/contact/contact-form-client.ts`) calls `getContactForm()`
  from `@goodnight-web/server/client` at runtime and renders the fields of
  the current form definition in order (labels, placeholders, hints,
  required marks, `maxlength`, and options in the page's language). The
  email field, the privacy consent, the honeypot `gnw_hp_x` (off screen,
  `aria-hidden`, `tabindex="-1"`, `autocomplete="off"`, and the
  password-manager opt-outs `data-1p-ignore`, `data-lpignore`,
  `data-bwignore`, `data-form-type="other"`), and the Turnstile widget are
  always there. When the request fails, it shows a
  short error with the company email from `site.config.ts`. When
  `available` is false, it shows the "not available yet" notice. Otherwise
  it loads Turnstile with `render=explicit` and renders the widget with the
  site key and action from the same response. The site key is set only in
  `wrangler.jsonc`; the static pages never contain it.
- On submit the script checks the fields with the browser's constraint
  validation, then sends them with `submitContact()`: `email`, `consent`,
  `fields` (by field id), `formVersion`, `locale`, the Turnstile token,
  `elapsedMs`, and `pagePath`. On `form_outdated` (the form changed while the
  visitor was typing) it loads the form again, keeps the values of fields
  that still exist, and asks the visitor to send again. Results: success (thank-you panel),
  `invalid_input` (per-field messages from `fields`), `turnstile_failed`,
  `rate_limited`, `payload_too_large` (asks the visitor to shorten the
  text), `contact_unavailable` (switches to the notice), and any
  other error. The Turnstile widget is reset after every failed attempt
  because tokens are single-use. Messages are the starter's own ja/en texts
  in `contact-form.astro`.
- Without JavaScript the page shows a `noscript` note with the other ways to
  get in touch; the form never posts as `application/x-www-form-urlencoded`.

## Update check workflow

`.github/workflows/update-check.yml` runs on `pull_request_target`
(`opened`, `synchronize`, `reopened`) and posts one comment, found by the
hidden marker `<!-- goodnight-web:update-check -->` and the
`github-actions[bot]` author, and updated in place. It also sets the commit
status `goodnight-web/update-check` on the head commit: `success` only for an
official update, `failure` otherwise, and `error` when the pull request could
not be read. A comment can be copied into a pull request body; the status is
bound to the commit, and setting it takes write access to the repository
(the workflow token has it).

- It checks out only `.github/scripts` from the base commit
  (`pull_request.base.sha`, `persist-credentials: false`) and loads
  `.github/scripts/update-check.cjs` with `actions/github-script`. Code from
  the pull request is never checked out or run.
- Permissions: `contents: read` (checkout of a private repository),
  `pull-requests: write` (the comment), and `statuses: write` (the commit
  status).
- A pull request is official only if all of these hold: the author is
  `dependabot[bot]` with type `Bot`; the head repository is the base
  repository; every commit listed by `pulls.listCommits` has the GitHub
  author and committer `dependabot[bot]` (a commit pushed by a collaborator,
  a commit with no linked account, and a commit made in the web interface,
  whose committer is `web-flow`, all fail; so does a commit whose
  signature GitHub does not show as verified, and a last listed commit that is
  not the `head.sha` of the event); the changed files are only root `package.json`,
  `package-lock.json`, `bun.lock`, or `pnpm-lock.yaml`, all with status
  `modified`; `package.json` is one of them; every changed
  `package.json` line is an `@goodnight-web/*` entry set to a version
  number; and the `package-lock.json` diff passes the lockfile check below.
- The check fails closed. The pull request is not official when the file
  list may be incomplete (its length differs from the event's
  `changed_files`, or it reaches the API limit of 3000 files), when the
  commit list may be incomplete (its length differs from the event's
  `commits`, or it reaches the API limit of 250 commits), when either list
  cannot be read (the comment is set to the warning, the status to `error`,
  and the job fails), or when the `package.json` or `package-lock.json` diff
  is missing, malformed, cut short within a hunk, or does not add up to the
  file's `additions` and `deletions` (a left-out hunk).
- Lockfile check (replaces the 2026-10-22 decision not to check lockfile
  contents, now that the starter commits `package-lock.json`). A new
  `@goodnight-web/server` version can change its own dependencies (for
  example `hono`), and those changes appear only in the lockfile, so other
  packages may change there. But every changed line of `package-lock.json`
  must look like lockfile JSON, every added `"resolved"` must start with
  `https://registry.npmjs.org/`, every added `"integrity"` must be
  `sha512-...`, and no added line may be `"link": true` or hold a `git+`,
  `git:`, `github:`, `file:`, `link:`, `http://`, or other-host URL
  (funding links excepted). `bun.lock` and `pnpm-lock.yaml` get the same URL
  checks on added lines. The lockfile is not re-resolved against the
  registry.
- Text from the pull request that the script quotes (file names, lines,
  logins) has control and format characters, CR and LF included, replaced
  with `?`, and each reason is a code span in the comment, so a crafted file
  name cannot add Markdown after the heading or a workflow command to the
  log.
- Tests: `templates/starter/.github/scripts/update-check.test.ts`, run by the
  root `bun run test`. The root `tsconfig.json` type-checks the module with
  `checkJs`.

Known limits:

- Not tested on GitHub yet: `pull_request_target` for Dependabot pull
  requests with `pull-requests: write`, the comment flow, the commit status
  flow with `statuses: write`, and the committer GitHub records for
  Dependabot's own commits (expected to be `dependabot[bot]`, and expected to be signed; if not,
  every update gets the warning, which fails closed).
- The workflow pins `actions/checkout` (v7.0.1) and `actions/github-script`
  by SHA.
  The starter's Dependabot config covers npm only, so these pins do not get
  update pull requests in user repositories.

## Visibility check workflow

`.github/workflows/visibility-check.yml` runs on `push` and
`workflow_dispatch` with `permissions: {}`. It fails with a Japanese and
English `::error::` annotation and job summary when
`github.event.repository.private` is not `true`. It lives in
`templates/starter/.github`, so GitHub does not run it in this repository; it
runs only in the copies that the Deploy button creates.

The Deploy form's **Create private Git repository** box is not ticked by
default, and Cloudflare documents no URL parameter or other way to tick it
for the user (the button URL takes only `url`). The starter README and the
documentation therefore tell users to tick it, and this workflow catches the
copies that were created as public.

## Dependabot

`.github/dependabot.yml` uses the npm ecosystem, weekly, with
`cooldown.default-days: 5`. `@goodnight-web/*` is one group; other packages'
minor and patch updates are a second group. Security updates are not
delayed by the cooldown. Each pull request updates `package.json` and
`package-lock.json` together.

## When the starter is copied out

The Deploy to Cloudflare button points at the folder, not at a separate
repository:
`https://deploy.workers.cloudflare.com/?url=https://github.com/iktakahiro/goodnight-web/tree/main/templates/starter`.
Cloudflare treats the subdirectory as the root of the new repository, so the
folder must work alone (the documented limit for subdirectory URLs: the app
"must be fully isolated within that subdirectory, including any
dependencies"). There is no sync workflow and no second repository.

What makes it work:

- `@goodnight-web/server` is pinned to an exact version that is published on
  npm ([releasing.md](releasing.md)). Bump the server version first and the
  starter's pin after the new version is published, in a second pull
  request; `bun run check:release` (part of `validate` and CI) checks that
  the pin is an exact version no newer than the server version, that
  neither package uses `workspace:`, `file:`, or `link:`, and that the
  tarball has everything the Worker needs.
- The server package ships TypeScript source (`exports` point to `src/*.ts`).
  Astro and wrangler bundle it from `node_modules` without trouble.
  `src/features/admin-ui/admin-files.gen.ts` and `admin-messages.gen.json` are
  generated and git-ignored; `prepack` runs the package build, so `npm pack`,
  `bun pm pack`, and publishing always include them.
- `better-auth` and `@better-auth/passkey` have exact-version peer
  dependencies (`@better-auth/core`, `better-call`, and others). Bun
  resolves them silently, but npm ran for minutes at 100 % CPU and
  then failed with `ERESOLVE` when the starter had no lockfile. The server package therefore lists those peers as exact
  dependencies. Move them together with `better-auth`.
- The starter's `.github/dependabot.yml` and workflows use root-relative
  paths (`/`, root `package.json`), which is right for a repository root.
  The `e2e` folder and `.github/scripts/update-check.test.ts` are copied
  too; they are harmless.
- The starter has a `package-lock.json`. Workers Builds runs `npm ci` when
  the file exists (npm 10.9.2 in the current build image), so the first
  Deploy installs exactly the committed tree, and later builds install the
  same tree until a pull request changes it. It was generated with npm
  10.9.2 from the starter's `package.json` in a directory outside this
  repository, against the published `@goodnight-web/server`, so the
  workspace link never reaches it: every entry resolves to
  `https://registry.npmjs.org/` with a sha512 integrity, and there are no
  `link`, `file:`, or workspace entries. Every package in it except
  `@goodnight-web/server` itself was older than 48 hours when it was locked
  (the same release-age rule as `bunfig.toml`); see
  [releasing.md](releasing.md) for the commands.
- Dependabot (npm ecosystem) updates `package-lock.json` together with
  `package.json`, with the same 5-day cooldown. A site owner who edits
  `package.json` by hand must run `npm install` and commit both files, or
  `npm ci` fails; the starter README and `AGENTS.md` say so.
- The lockfile is regenerated after each server release (for example after
  0.9.1 is published), in the pull request that bumps the starter's pin.
  The new version must be on npm before the lockfile can resolve it.
- `bun run check:release` checks the lockfile offline: it exists, its root
  `dependencies` and `devDependencies` equal `package.json`, it locks the
  pinned `@goodnight-web/server` version from its npm tarball URL (the pin
  may be older than the server package version, never newer), and every
  entry comes from the npm registry with a
  sha512 integrity. CI also runs `npm ci --dry-run --ignore-scripts` (npm
  10.9.2) on a copy of `package.json` and `package-lock.json`, which fails
  when the two are out of step.
- In this monorepo, bun reads only `bun.lock` and ignores
  `package-lock.json`, so `bun install --frozen-lockfile` and the
  workspaces are unchanged. oxfmt leaves the file as npm wrote it.

How it was checked: `templates/starter` was copied to a directory outside the
repository, `@goodnight-web/server` was installed from the tarball made by
`bun pm pack`, and `npm install`, `astro build`, `astro check`,
`wrangler deploy --dry-run`, `wrangler d1 migrations apply DB --local`, and
`node e2e/run.ts` all passed. The real button flow (repository creation,
resource provisioning, Workers Builds) can be tested only from a public
repository. `@goodnight-web/server` is published on npm (maintainer
`iktakahiro`; the first release, 0.1.0, was on 2026-10-23).

## End-to-end test

`bun run test:e2e` in `templates/starter` (`node e2e/run.ts`; it uses only
Node APIs so users can run it with npm) builds the site, applies the
migrations from `node_modules/@goodnight-web/server/migrations` to a fresh
local D1 in `.wrangler/e2e-state`, and starts `wrangler dev` three times on
`E2E_PORT` (default 8841). `E2E_SECRETS` picks the secrets, as in
`packages/server/e2e`: `app-secret` (default) passes `APP_SECRET` and
`ADMIN_EMAILS` only, as the Deploy form asks; `legacy` passes `SETUP_TOKEN`,
`ADMIN_EMAILS`, `BETTER_AUTH_SECRET`, and `IP_HASH_SECRET`. CI runs both.
Every secret is passed with `--var`, and the other mode's secrets as empty
values, so a local `.dev.vars` does not change the result.

1. `src/worker.ts` without Turnstile keys: the home page in ja and en, the
   contact page shows "not available yet", `GET /api/contact/form` says
   `available: false`, `POST /api/contact` answers 503, and `/admin` returns
   the admin UI (HTML with a CSP header) from the Worker.
2. `src/worker.ts` with Cloudflare's Turnstile test keys: the widget gives a
   token, and the server rejects it, because siteverify answers the test
   secret with `hostname: "example.com"` and no `action`
   (`metadata.result_with_testing_key: true`; checked with `curl` on
   2026-10-22). Nothing is stored.
3. `e2e/worker.ts` with the test keys. It wraps `src/worker.ts` and, only for
   siteverify answers marked `result_with_testing_key`, sets `hostname` to
   the request's hostname and `action` to `contact`. The production check is
   unchanged. The test checks the ja validation messages, waits 3.5 s (the
   server flags faster submissions as suspected spam (`too_fast`)), submits, and reads the row
   with `wrangler d1 execute DB --local`: email, `fields` (name, category,
   message), `form_version`, `status = unread`, `suspected_spam = 0`, empty
   `spam_reasons`, `page_path`, and a 64-character hex `ip_hash` keyed with
   `IP_HASH_SECRET` or the key derived from `APP_SECRET`. Then it
   opens `/admin` in a Japanese browser context with a CDP virtual
   authenticator (as in `packages/server/e2e`): the setup screen names the
   expected secret, setup with `APP_SECRET` (or `SETUP_TOKEN` in `legacy`
   mode) and an `ADMIN_EMAILS` address, passkey registration (one resident
   credential, one `passkey` row, `setup_closed_at` set), sign-out (the admin API answers
   401), passkey sign-in, the submitted inquiry in the list, the switch to
   English, the detail (marks it read), and marking it unread again, which
   is stored in D1. It fails on any CSP violation or page error in the admin UI.

The admin steps find buttons and headings by role, with names from
`@goodnight-web/server/admin-messages.json` (the admin UI strings, written by
the package build), and the form fields from `GET /api/contact/form`. A
change to the admin copy or to the form does not break the test.

`E2E_SCREENSHOT_DIR` saves screenshots. `E2E_DEBUG_DIR` saves a screenshot
of each failed admin step and a Playwright trace of the admin screen. The
test needs `npx playwright install chromium` and network access to
`challenges.cloudflare.com`. CI runs it in the `e2e` job, after the server
end-to-end test.
