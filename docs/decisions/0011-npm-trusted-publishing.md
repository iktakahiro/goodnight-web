# 0011. Publish the server package with npm trusted publishing

- Status: accepted
- Date: 2026-10-24

## Context

`@goodnight-web/server` was published by hand with `npm publish` and a
one-time code, so no npm token was stored anywhere and versions carry no
provenance. The Deploy to Cloudflare button installs the published version
into every new site, so a mistaken or tampered publish reaches every new
site. The repository is public: anyone can read the workflows and open pull
requests, but only the maintainer can push to `main` or push tags.

## Decision

- **Publish from GitHub Actions with npm trusted publishing (OIDC).** npm
  accepts a publish only from the workflow named in the package's trusted
  publisher entry (owner, repository, workflow file `release.yml`,
  environment `npm-publish`). No `NPM_TOKEN` exists in the repository.
- **Tag trigger only.** `release.yml` runs on a pushed `v*` tag, never on
  `pull_request`, `pull_request_target`, or `workflow_dispatch`. The top-level
  permissions are empty. The workflow refuses a tag that is not a plain
  version, that is not in the history of `main`, or that differs from the
  package version.
- **Build and publish are separate jobs.** The build job validates and packs
  with read-only access and no OIDC token. The publish job has
  `id-token: write`, runs in the `npm-publish` environment (a required
  reviewer approves each run), verifies the tarball's SHA-256, and uploads
  that tarball without installing anything from the repository.
- **Tokens are switched off** on npm ("Require two-factor authentication and
  disallow tokens") once the first workflow publish worked, so a leaked token
  cannot publish.
- **Publishing by hand stays documented** as the emergency fallback
  ([releasing.md](../releasing.md)).

## Consequences

- A compromise needs write access to the repository and the approval of the
  environment's reviewer, instead of one stolen token.
- Versions published from the workflow have a provenance statement.
- npm does not check the trusted publisher entry when it is saved, a new entry
  expires if no publish completes within 2 days, and the settings (environment
  name, file name) are part of the trust: renaming `release.yml` or the
  environment means creating a new entry on npm.
- `bun run validate` includes the starter lockfile check, which needs the
  version to be on npm already (see [releasing.md](../releasing.md)); a
  version bump therefore cannot pass the workflow's validation on `main`
  before it is published. Changing that ordering is a separate decision.
- npm staged publishing (`npm stage publish`, approved with two-factor
  authentication) would add a stricter gate than the environment approval.
  It is not used now.
