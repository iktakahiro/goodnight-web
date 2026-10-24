# Releasing `@goodnight-web/server`

The starter pins an exact version of `@goodnight-web/server`
([starter.md](starter.md)), and the Deploy to Cloudflare button installs it
from npm. The package is published by the `Release` workflow with npm trusted
publishing (OIDC), after the maintainer approves it. Publishing by hand with
`npm publish` is the fallback for emergencies. No npm token is stored in this
repository ([decisions/0011](decisions/0011-npm-trusted-publishing.md)).

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

## Publish with trusted publishing

[`.github/workflows/release.yml`](../.github/workflows/release.yml) runs when
a tag `v*` is pushed, and only then: no pull request, fork, or manual trigger
can start it. It has two jobs.

1. **build** (read-only, no OIDC token). It checks that the tag is a plain
   version tag (`v0.9.2`), that the tagged commit is in the history of
   `main`, and that the tag equals `v` plus the `version` in
   `packages/server/package.json`. Then it runs `bun install --frozen-lockfile`
   and `bun run validate` (including `check:release`), packs the server with
   `bun pm pack`, checks that tarball with
   `bun scripts/check-release.ts --tarball`, and uploads it as an artifact.
2. **publish**. It uses the `npm-publish` environment, so it waits until a
   required reviewer approves it. It then checks the tarball against the
   SHA-256 that **build** computed, checks the tag against the tarball's
   version, and runs `npm publish <tarball> --access public`. It installs no
   dependency of this repository, so only the tarball that **build** checked
   can be uploaded. Only this job has `id-token: write`.

npm gives the workflow a short-lived credential for that one publish, and
records a provenance statement for the version, because the repository and the
package are public. The workflow needs npm 11.5.1 or later (Node 24 ships a
newer one) and a GitHub-hosted runner; it fails early if npm is older.

To release a version, first merge the pull request that bumps only the server
version ("Next versions" below). Then, with `main` at that commit:

```sh
git tag -a v0.9.2 -m "v0.9.2"      # the version in packages/server/package.json
git push origin v0.9.2
```

Then open the run in the **Actions** tab, check **build**, and approve the
**publish** job (**Review deployments**). Afterwards:

```sh
npm view @goodnight-web/server version
```

and install `templates/starter` as a copy outside the repository (see "How it
was checked" in [starter.md](starter.md)).

A tag that fails a check (not on `main`, wrong version, failed validation)
publishes nothing. Delete it, fix the cause, and tag again. An npm version can
be published only once, so a version that was published is never published
again: bump the version instead.

### Set up once (maintainer)

The workflow does nothing until these two settings exist. The names must match
the workflow exactly; npm does not check them when they are saved, so a typo
shows up only when a publish fails.

1. **GitHub environment.** Repository **Settings > Environments > New
   environment**, name `npm-publish`. Under **Required reviewers**, add
   yourself. Leave **Prevent self-review** off: you are the only maintainer
   and the one who pushes the tag, so with it on nobody could approve.
   Optionally, under **Deployment branches and tags**, choose **Selected
   branches and tags** and add a **Tag** rule `v*`, so that only version tags
   can use the environment. See GitHub's
   [Managing environments for deployment](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).
2. **Trusted publisher on npm.** On npmjs.com, open the package
   `@goodnight-web/server`, then its **Settings > Trusted publishing** and
   choose **GitHub Actions**. Enter:
   - Organization or user: `iktakahiro`
   - Repository: `goodnight-web`
   - Workflow filename: `release.yml` (the file name only, with the
     extension)
   - Environment name: `npm-publish`
   - Allowed actions: include direct publishing with `npm publish` (the
     workflow runs `npm publish`; the option that only allows
     `npm stage publish` would reject it).

   npm configures this from the package's own settings, and the package
   already exists on npm. A trusted publisher that has not completed a publish within 2 days of being created
   expires and must be created again, so register it just before the first
   release. The package's `repository.url` must match this repository
   (`git+https://github.com/iktakahiro/goodnight-web.git`), which it does.

3. **After the first publish from the workflow succeeded**, turn off token
   publishing: on npmjs.com, the package's **Settings > Publishing access**,
   choose **Require two-factor authentication and disallow tokens**, and save
   with **Update Package Settings**. Trusted publishing keeps working; every
   token, including a stolen one, stops working for publishing. Revoke any
   automation token that is no longer needed.

Menu names follow npm's
[Trusted publishing for npm packages](https://docs.npmjs.com/trusted-publishers)
at the time of writing; if the page has moved, that document is the reference.
npm also offers staged publishing (`npm stage publish`, approved with two-factor
authentication on npmjs.com), a stricter gate that needs npm 11.15.0 or later;
see [Staged publishing](https://docs.npmjs.com/staged-publishing). This
repository uses the environment approval instead.

## Publish by hand (emergency fallback)

Use this only when the workflow cannot run. It needs a maintainer's npm
account. The order of "Next versions" is the same; only steps 2 and 3 are
replaced by these commands.

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

npm can lock only a version that is already on npm, and the starter's
`package-lock.json` must lock the version it pins. So the starter's pin
follows the server one release behind: `bun run check:release` accepts a pin
that equals the server version or is older than it, as long as the lockfile
locks that pin from the npm registry. Every commit on `main` therefore passes
validation, and the Deploy button always installs a published version.

1. **Bump the server.** A pull request changes only `version` in
   `packages/server/package.json` (with the code it releases) and runs
   `bun install`, which updates `bun.lock`. The starter keeps its pin, so
   bun now installs the pinned, published version from npm for
   `templates/starter` instead of linking the workspace. The starter's
   type check, build, and e2e test in CI run against that published
   version, so a starter change that needs the new server code waits for
   step 4. Merge it.
2. **Tag.** Push the tag `v<version>` on that commit of `main` (above).
3. **Approve.** Approve the **publish** job of the `Release` run. The
   workflow publishes the version; check it with `npm view`.
4. **Bump the starter.** A second pull request changes the pin in
   `templates/starter/package.json` to the new version, runs `bun install`
   (bun links the workspace again), and regenerates
   `templates/starter/package-lock.json` against the published version
   (below). Merge it. The Deploy button then installs the new version,
   exactly as locked.
5. Sites that were already copied update through their own Dependabot
   pull requests, which update their own `package-lock.json`, and the
   `update-check` workflow.

Between step 1 and step 4, the starter in this repository runs the previous
version. The workflow checks only that the tag equals the version in
`packages/server/package.json`; the starter's pin is not part of it.
`bunfig.toml` excludes `@goodnight-web/server` from its 48-hour release-age
rule (`minimumReleaseAgeExcludes`), so step 1 works even when the pinned
version was published less than 48 hours ago.

### Regenerate the starter lockfile

Use the npm version that Workers Builds uses (10.9.2), in a directory outside
the repository, so the workspace link cannot leak into the lockfile. The
first run locks everything except `@goodnight-web/server` with `--before`
48 hours ago (the release-age rule of `bunfig.toml`); the second adds the
just-published server package. The server's own dependencies are exact pins,
so the second run adds nothing else.

```sh
repo="$PWD"                 # the repository root
scratch="$(mktemp -d)"
cp templates/starter/package.json "$scratch/"
cd "$scratch"
# 1. Without the server package, but with its exact dependencies.
node -e '
  const fs = require("fs");
  const pkg = JSON.parse(fs.readFileSync("package.json"));
  const server = require(process.argv[1] + "/packages/server/package.json");
  delete pkg.dependencies["@goodnight-web/server"];
  Object.assign(pkg.dependencies, server.dependencies);
  fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2));
' "$repo"
npx -y npm@10.9.2 install --package-lock-only --ignore-scripts \
  --registry=https://registry.npmjs.org/ \
  --before="$(date -u -d '48 hours ago' +%Y-%m-%dT%H:%M:%SZ)"
# 2. With the real package.json.
cp "$repo/templates/starter/package.json" .
npx -y npm@10.9.2 install --package-lock-only --ignore-scripts \
  --registry=https://registry.npmjs.org/
npx -y npm@10.9.2 ci --dry-run --ignore-scripts
cp package-lock.json "$repo/templates/starter/"
cd "$repo" && bun run check:release
```

(`date -d` is GNU date; on macOS use `date -u -v-48H +%Y-%m-%dT%H:%M:%SZ`.)
Then, in a full copy of `templates/starter` outside the repository (with the new
`package-lock.json`), run `npx -y npm@10.9.2 ci`, `npx astro build`, and
`npx wrangler deploy --dry-run` to see that the locked tree builds.

## Provenance

Versions published by the `Release` workflow carry a provenance statement
(npm shows it on the package page): which repository, commit, and workflow run
built it. Versions published by hand, such as 0.1.0 to 0.9.1, carry none.
