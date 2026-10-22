# Starter (`templates/starter`)

The starter is the Astro site that users copy and own. This document is for
maintainers. The user-facing rules are in the starter's own `AGENTS.md` and
`README.md`.

The starter depends on `@goodnight-web/server` through `workspace:*`. Its
`src/worker.ts` calls `createGoodnightWorker()`, and `wrangler.jsonc` has the
bindings the server needs.

## Layout

| Path                                     | Contents                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| `site.config.ts`                         | Company details, nav, locales, theme colors, contact categories                |
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

- `src/worker.ts` passes `locale: siteConfig.defaultLocale` and
  `siteConfig.contactCategories` (values with ja/en labels) to
  `createGoodnightWorker()`. The server accepts only those values, and the
  admin UI shows the labels in its current language, so the categories are
  configured in one place.
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
- The D1 binding has no `database_id`. `wrangler dev`, `d1 migrations apply
  --local`, and `deploy --dry-run` work without it. That the Deploy button
  creates the database and fills in the ID is not verified yet (M2).
- Secrets (`SETUP_TOKEN`, `ADMIN_EMAILS`, `BETTER_AUTH_SECRET`,
  `IP_HASH_SECRET`, `TURNSTILE_SECRET`, optional `SLACK_WEBHOOK_URL`) are
  listed with comments in `.dev.vars.example`. `package.json`
  `cloudflare.bindings` has a Markdown description in Japanese and English
  for each secret, variable, and binding, for the Deploy button form.
- Scripts: `deploy` is `wrangler d1 migrations apply DB --remote && wrangler
  deploy`; `deploy:check` is `wrangler deploy --dry-run` (CI runs it through
  `turbo run deploy:check`); `preview` builds, applies migrations locally,
  and runs `wrangler dev`.

## Contact form

- The page renders the form hidden. The script
  (`src/features/contact/contact-form-client.ts`) calls `getContactConfig()`
  from `@goodnight-web/server/client`. When `available` is false (or the
  request fails), it shows the "not available yet" notice with the company's
  email and phone. Otherwise it loads Turnstile with `render=explicit` and
  renders the widget with the site key and action from the config. The site
  key is set only in `wrangler.jsonc`; the static pages never contain it.
- Field names match `contactRequestSchema`: `name`, `email`, `company`,
  `phone`, `category`, `message`, `consent`, and the honeypot `website`.
  `maxlength` values come from `CONTACT_FIELD_LIMITS` at build time.
- On submit the script checks the fields with the browser's constraint
  validation, then sends them with `submitContact()`, adding the Turnstile
  token, `elapsedMs`, and `pagePath`. Results: success (thank-you panel),
  `invalid_input` (per-field messages from `fields`), `turnstile_failed`,
  `rate_limited`, `contact_unavailable` (switches to the notice), and any
  other error. The Turnstile widget is reset after every failed attempt
  because tokens are single-use. Messages are the starter's own ja/en texts
  in `contact-form.astro`.
- Without JavaScript the page shows a `noscript` note with the other ways to
  get in touch; the form never posts as `application/x-www-form-urlencoded`.

## Update check workflow

`.github/workflows/update-check.yml` runs on `pull_request_target`
(`opened`, `synchronize`, `reopened`) and posts one comment, found by the
hidden marker `<!-- goodnight-web:update-check -->` and the
`github-actions[bot]` author, and updated in place.

- It checks out only `.github/scripts` from the base commit
  (`pull_request.base.sha`, `persist-credentials: false`) and loads
  `.github/scripts/update-check.cjs` with `actions/github-script`. Code from
  the pull request is never checked out or run.
- Permissions: `contents: read` (checkout of a private repository) and
  `pull-requests: write` (the comment).
- A pull request is official only if all of these hold: the author is
  `dependabot[bot]` with type `Bot`; the head repository is the base
  repository; the changed files are only root `package.json`,
  `package-lock.json`, `bun.lock`, or `pnpm-lock.yaml`, all with status
  `modified`; `package.json` is one of them; and every changed
  `package.json` line is an `@goodnight-web/*` entry set to a version
  number.
- The check fails closed. The pull request is not official when the file
  list may be incomplete (its length differs from the event's
  `changed_files`, or it reaches the API limit of 3000 files), when the
  file list cannot be read (the comment is set to the warning and the job
  fails), or when the `package.json` diff is missing, malformed, cut short
  within a hunk, or does not add up to the file's `additions` and
  `deletions` (a left-out hunk).
- Lockfile contents are not checked (decision by the dev lead, 2026-10-22).
  A new `@goodnight-web/server` version can change its own dependencies (for
  example `hono`), and those changes appear only in the lockfile. The
  site's direct dependencies are in `package.json`, which is checked line by
  line. Dependabot generates the lockfile from the registry, and a pull
  request from a fork or another author is never official.
- Tests: `templates/starter/.github/scripts/update-check.test.ts`, run by the
  root `bun run test`. The root `tsconfig.json` type-checks the module with
  `checkJs`.

Known limits:

- Not tested on GitHub yet: `pull_request_target` for Dependabot pull
  requests with `pull-requests: write`, and the comment flow.
- The workflow pins `actions/checkout` (v7.0.1) and `actions/github-script`
  by SHA.
  The starter's Dependabot config covers npm only, so these pins do not get
  update pull requests in user repositories.

## Visibility check workflow

`.github/workflows/visibility-check.yml` runs on `push` and
`workflow_dispatch` with `permissions: {}`. It fails with a Japanese and
English `::error::` annotation and job summary when
`github.event.repository.private` is not `true`. It skips
`iktakahiro/goodnight-web-starter`, the public repository users copy from.
Change that name if the public repository moves.

## Dependabot

`.github/dependabot.yml` uses the npm ecosystem, weekly, with
`cooldown.default-days: 5`. `@goodnight-web/*` is one group; other packages'
minor and patch updates are a second group. Security updates are not
delayed by the cooldown.

## When the starter is copied out (M2)

The release workflow that syncs `templates/starter` to the public repository
has to:

- replace `workspace:*` for `@goodnight-web/*` with the published exact
  version;
- generate a `package-lock.json`, because users install with npm and
  Dependabot's npm ecosystem reads it;
- leave out `*.test.ts` files from `.github/scripts`;
- decide whether `e2e/` and the `playwright` dev dependency ship to users
  (they are useful for AI tools that change the contact form);
- keep the repository name in `visibility-check.yml` in step.

## End-to-end test

`bun run test:e2e` in `templates/starter` (`node e2e/run.ts`; it uses only
Node APIs so users can run it with npm) builds the site, applies the
migrations from `node_modules/@goodnight-web/server/migrations` to a fresh
local D1 in `.wrangler/e2e-state`, and starts `wrangler dev` three times on
`E2E_PORT` (default 8841). Every secret is passed with `--var`, so a local
`.dev.vars` does not change the result.

1. `src/worker.ts` without Turnstile keys: the home page in ja and en, the
   contact page shows "not available yet", `GET /api/contact/config` says
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
   server holds faster submissions as `too_fast`), submits, and reads the row
   with `wrangler d1 execute DB --local`: name, email, category, message,
   `status = new`, `page_path`, and a 64-character hex `ip_hash`. Then it
   opens `/admin` in a Japanese browser context with a CDP virtual
   authenticator (as in `packages/server/e2e`): setup with `SETUP_TOKEN` and
   an `ADMIN_EMAILS` address, passkey registration (one resident credential,
   one `passkey` row, `setup_closed_at` set), sign-out (the admin API answers
   401), passkey sign-in, the submitted inquiry in the list with the Japanese
   category label from `site.config.ts`, the switch to English (the English
   label), the detail (marks it read), and a status change to Done that is
   stored in D1. It fails on any CSP violation or page error in the admin UI.

The admin steps find buttons and headings by role, with names from
`@goodnight-web/server/admin-messages.json` (the admin UI strings, written by
the package build), and take the contact category from `site.config.ts`. A
change to the admin copy or to the site's categories does not break the
test.

`E2E_SCREENSHOT_DIR` saves screenshots. `E2E_DEBUG_DIR` saves a screenshot
of each failed admin step and a Playwright trace of the admin screen. The
test needs `npx playwright install chromium` and network access to
`challenges.cloudflare.com`. CI runs it in the `e2e` job, after the server
end-to-end test.
