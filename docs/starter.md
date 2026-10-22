# Starter (`templates/starter`)

The starter is the Astro site that users copy and own. This document is for
maintainers. The user-facing rules are in the starter's own `AGENTS.md` and
`README.md`.

Status: phase 1. The site, content, form UI, and GitHub files are in place.
`src/worker.ts`, the Worker bindings in `wrangler.jsonc`, the contact form
submission, and end-to-end tests are added after `@goodnight-web/server`
exists.

## Layout

| Path                                     | Contents                                                                    |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| `site.config.ts`                         | Company details, nav, locales, theme colors, Turnstile site key, categories |
| `src/pages/[...lang]/`                   | Every localized page, built once per locale                                 |
| `src/pages/404.astro`                    | One 404 page with all languages                                             |
| `src/content/{news,blog,pages}/<ja,en>/` | Markdown content, one folder per locale                                     |
| `src/features/contact/`                  | Contact form markup, browser script, and the submit placeholder             |
| `src/features/posts/`                    | News and blog lists, detail page, and collection helpers                    |
| `src/components/ui/`                     | Small shadcn-style components written as `.astro` files                     |
| `src/components/site/`                   | Header, footer, language switcher, page header                              |
| `src/i18n/`                              | Locale helpers and shared UI strings                                        |
| `.github/`                               | Dependabot config, Update check and Visibility check workflows              |

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

## Contact form

- Field names: `name`, `email`, `company`, `phone`, `category`, `body`,
  `consent`, and the honeypot `website`. The Turnstile widget uses
  `data-action="contact"`, so the server can check `action`.
- When `turnstileSiteKey` is empty, the page shows "not available yet" and no
  form. This mirrors the server, which returns 503 without
  `TURNSTILE_SECRET`.
- `src/features/contact/submit-contact.ts` is a placeholder that always
  returns `unavailable`. Phase 2 replaces it with the client helper from
  `@goodnight-web/server`.
- Categories come from `site.config.ts`. `notify: false` (used for "sales
  proposal") is meant for the server's Slack notification; the server option
  does not exist yet.

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
  `modified`; every changed `package.json` line is an `@goodnight-web/*`
  entry set to a version number; and every changed lockfile line belongs to
  an `@goodnight-web/*` package. Anything that cannot be checked (for
  example a diff that GitHub leaves out because it is too large) is not
  official.
- Lockfile lines are attributed to a package by name (`"node_modules/x"`,
  bun.lock `["x@1.2.3", ...]` values, pnpm keys) or, for lines such as
  `"version"` and `resolution`, by the nearest package entry above them in
  the same hunk.
- Tests: `templates/starter/.github/scripts/update-check.test.ts`, run by the
  root `bun run test`. The root `tsconfig.json` type-checks the module with
  `checkJs`.

Known limits:

- A `@goodnight-web/server` release that changes its own dependencies also
  changes those packages in the user's lockfile (for example `hono`). Such a
  pull request gets the warning comment. Deciding whether to accept changes
  that come from the server's dependency tree is open.
- Not tested on GitHub yet: `pull_request_target` for Dependabot pull
  requests with `pull-requests: write`, and the comment flow.
- The workflow pins `actions/checkout` and `actions/github-script` by SHA.
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
- keep the repository name in `visibility-check.yml` in step.
