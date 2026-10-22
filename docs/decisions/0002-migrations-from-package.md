# 0002. Ship D1 migrations inside `@goodnight-web/server`

- Status: accepted
- Date: 2026-10-22

## Context

Users install `@goodnight-web/server` from npm and never edit it. When we
change the database schema, the change has to reach users through a normal
package update. The starter's deploy script is
`wrangler d1 migrations apply DB --remote && wrangler deploy`.

Questions:

- Can `migrations_dir` in the user's `wrangler.jsonc` point into
  `node_modules/@goodnight-web/server/migrations`?
- Does it work for every way the package can be installed?
- How do we produce the Better Auth tables as plain SQL that can ship as a
  static migration?

## What we tested

Versions: `wrangler` 4.151.2, npm 11.21.0 (Node 24.22.1), bun 1.4.2, `auth` (Better
Auth CLI) 1.7.11.

A fake `@goodnight-web/server` package with `migrations/0001_better_auth.sql`
(the Better Auth schema) and `migrations/0002_app.sql`. Each consumer site had
this binding:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "gnw-spike-migrations",
    "database_id": "00000000-0000-0000-0000-000000000000",
    "migrations_dir": "node_modules/@goodnight-web/server/migrations"
  }
]
```

In each site we ran:

```sh
wrangler d1 migrations apply DB --local
wrangler d1 execute DB --local --command "select name from d1_migrations"
```

## Results

| How the package was installed                             | What is in `node_modules`                   | Result                                                                                                |
| --------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| npm, tarball from `npm pack` (same as a registry install) | plain copied directory                      | applied 0001 and 0002                                                                                 |
| npm, `file:../fake-pkg`                                   | symlink to the package directory            | applied 0001 and 0002                                                                                 |
| bun workspace, `workspace:*`, isolated linker             | symlink in `templates/starter/node_modules` | applied 0001 and 0002                                                                                 |
| bun workspace, `workspace:*`, `--linker hoisted`          | symlink only in the root `node_modules`     | error: "No migrations present at .../templates/starter/node_modules/@goodnight-web/server/migrations" |
| bun, `file:../fake-pkg`                                   | real directory with one symlink per file    | "No migrations to apply!" (nothing applied, no error)                                                 |

Why the last row fails: wrangler lists migration files with
`readdirSync(dir, { withFileTypes: true })` and keeps only entries where
`isFile()` is true. A symlinked file is skipped. A symlinked directory is fine.

Upgrade simulation: we added `0003_add_category.sql` to the package, bumped it
to 0.0.2, reinstalled the tarball, and ran the commands again.
`wrangler d1 migrations list DB --local` showed only `0003_add_category.sql`,
and `apply` ran only that file. `d1_migrations` then held all three names.
`wrangler deploy --dry-run` passed with this config.

When `apply` runs without a terminal (as in CI or Workers Builds), wrangler
answers its confirmation prompt itself: "Using fallback value in
non-interactive context: yes".

### Better Auth schema as SQL

The Better Auth CLI is now the `auth` package (`@better-auth/cli` is
deprecated). It needs a real SQLite connection to compare against. A config
file that uses `node:sqlite` works without native modules:

```ts
import { DatabaseSync } from 'node:sqlite';
import { betterAuth } from 'better-auth';
import { passkey } from '@better-auth/passkey';

export const auth = betterAuth({
  baseURL: 'http://localhost:8787',
  database: new DatabaseSync(':memory:'),
  emailAndPassword: { enabled: false },
  plugins: [passkey()],
});
```

```sh
auth generate --config auth.cli.ts --output migrations/0001_better_auth.sql --yes
```

With an empty in-memory database, the output is the full schema: five
`create table` statements (`user`, `session`, `account`, `verification`,
`passkey`) and five indexes. D1 accepted it as is.

For later Better Auth upgrades, point the same config at a SQLite file that
already has our migrations applied. The CLI then prints only the difference.
We added a field to `user` and got one line:
`alter table "user" add column "locale" text;`. With no change it printed
"Your schema is already up to date." and wrote no file.

## Decision

- Ship SQL migrations in `@goodnight-web/server/migrations/` and include the
  directory in the package's `files`.
- The starter's `wrangler.jsonc` sets
  `"migrations_dir": "node_modules/@goodnight-web/server/migrations"`.
- Migration file names are permanent. wrangler records applied migrations by
  file name, so a released file is never renamed, edited, or deleted. Every
  change is a new numbered file.
- Generate Better Auth tables with the `auth` CLI and a `node:sqlite` config,
  and commit the output as a normal migration. On a Better Auth upgrade,
  generate against a database with the existing migrations applied, and commit
  the difference as the next migration.
- In this repository, keep Bun's isolated linker for workspaces (the current
  default for our `bun.lock`), so `templates/starter/node_modules` contains the
  package link.

## Open issues

- Pin `linker = "isolated"` in `bunfig.toml` so a future default change cannot
  break the starter's relative path. That belongs to the tooling, not this
  record.
- Do not use bun `file:` dependencies to test the starter outside the
  workspace; wrangler ignores the per-file symlinks without an error.
- Not tested: pnpm (directory symlinks, expected to work) and Yarn Plug'n'Play
  (no `node_modules`, will not work).
- Users cannot add their own migrations next to ours, because a binding has one
  `migrations_dir`. If a site ever needs its own tables, that needs a second
  plan.
- `wrangler d1 migrations create DB` would write into `node_modules`. The
  starter's `AGENTS.md` should say not to run it.
