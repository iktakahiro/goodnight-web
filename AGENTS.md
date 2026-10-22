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
- `packages/astro` (`@goodnight-web/astro`): an optional thin Astro
  integration. Add it only if the admin UI delivery needs it.
- `packages/typescript-config` (`@goodnight-web/typescript-config`): shared
  `tsconfig` presets (`base.json`, `react.json`).
- `templates/starter`: the Astro site that users copy and edit, usually with AI
  tools. It depends on `@goodnight-web/server` through `workspace:*` here and
  on a published exact version once copied out.
- `apps/docs`: the user-facing documentation site (Fumadocs and TanStack Start,
  prerendered and served by Workers Static Assets).
- `docs/`: contributor and maintainer documentation. Record design decisions
  in [docs/decisions/](docs/decisions/README.md).

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

- Never store a raw IP address. Store only `HMAC-SHA256(ip, IP_HASH_SECRET)`.
  Do not log raw IPs either.
- Fail closed. When a required setting or secret is missing, disable the
  feature instead of running without it. For example, without
  `TURNSTILE_SECRET` the contact API returns 503 and the form says it is not
  available yet.
- The admin UI and the admin API never work without authentication. There is
  no development bypass, default account, or shared key. Better Auth with
  passkeys is always required, even when Cloudflare Access is also used.
- The first admin can be created only with `SETUP_TOKEN` and an address in
  `ADMIN_EMAILS`. Setup closes once an admin exists.
- Save a contact submission to D1 before responding. Notifications and cleanup
  run in `ctx.waitUntil` and never change the response.
- Slack notifications contain no personal data and no message body: only the
  count, the category, and the admin URL.
- Verify Turnstile on the server, including `hostname` and `action`. Check
  `Origin` and the body size before parsing.
- Keep secrets in Worker secrets. Never return them to the browser or write
  them to D1.

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
- Create Better Auth and other per-request objects from the request's env
  bindings. Do not keep them in module scope.

## Validation

Run `bun run validate` and `bun run build` for every implementation change.
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
