# Releasing `@goodnight-web/server`

The starter pins an exact version of `@goodnight-web/server`
([starter.md](starter.md)), and the Deploy to Cloudflare button installs it
from npm. Publishing is a manual step for the maintainer; CI never publishes.

## Before the first publish (once)

Done for 0.1.0, which `iktakahiro` published on 2026-10-23. Kept here for
reference.

1. Sign in to npmjs.com with an account that has two-factor authentication
   turned on (required to publish; use "Authorization and writes").
2. Create the organization: **Add Organization**, name `goodnight-web`, the
   free plan (public packages). This reserves the `@goodnight-web` scope.
3. Merge any pending dependency or security update first (check the open
   Dependabot pull requests): the published version is what every new site
   installs, and the exact pins of `better-auth` and its peers in
   `packages/server/package.json` must be the ones you want to ship.

## Publish

From a clean checkout of `main`, after CI is green:

```sh
bun install --frozen-lockfile
bun run validate          # includes check:release
cd packages/server
npm login                 # once per machine
bun pm pack               # runs prepack: builds the admin module; output: goodnight-web-server-<version>.tgz
cd ../..
bun scripts/check-release.ts --tarball packages/server/goodnight-web-server-<version>.tgz
cd packages/server
npm publish ./goodnight-web-server-<version>.tgz --access public  # asks for the one-time code
rm goodnight-web-server-<version>.tgz
```

`check-release --tarball` checks the exact file that `npm publish` uploads:
its file list (the generated admin module, every migration, no tests) and
its `package.json` (name, version equal to `packages/server/package.json`,
no `workspace:` or other local ranges). `CHECK_RELEASE_TARBALL=<path>` does
the same. Without the option, `bun run check:release` checks the list from
`npm pack --dry-run` instead. `*.tgz` is git-ignored, so a leftover tarball
is never committed.

`bun pm pack` replaces `workspace:*` in the packed manifest with the real
version. `npm publish` of a tarball does not run `prepack`, so always make
the tarball with `bun pm pack` first. `npm publish --dry-run` (from
`packages/server`) lists the files without publishing.

Then check it:

```sh
npm view @goodnight-web/server version
```

and install `templates/starter` as a copy outside the repository (see "How it
was checked" in [starter.md](starter.md)).

## Next versions

1. Change `version` in `packages/server/package.json` and the pin in
   `templates/starter/package.json` to the same number, and run
   `bun install` (it updates `bun.lock`). `bun run check:release` fails if
   they differ.
2. Merge, then publish as above. Publish the package before merging a starter
   change that needs it, or the Deploy button breaks for a while.
3. Sites that were already copied update through their own Dependabot
   pull requests, or the `update-check` workflow.

## Provenance

The maintainer publishes by hand with `npm publish`, as above, so the
published versions carry no provenance attestation. This repository
intentionally has no publish workflow, and CI holds no npm token.

If provenance is wanted later, the option is npm trusted publishing from
GitHub Actions (OIDC): on npmjs.com open the package **Settings > Trusted
publisher**, add the GitHub repository `iktakahiro/goodnight-web` and a
release workflow, give that workflow `id-token: write`, and publish from it.
npm then records provenance for each version. The repository must be public
for provenance. After that, turn on "Require two-factor authentication and
disallow tokens" for the package. Adding that workflow is a separate
decision; record it in [decisions/](decisions/README.md).
