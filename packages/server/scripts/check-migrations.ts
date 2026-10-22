// Fails when src/db/schema.ts has changes that no migration covers, so a
// schema change cannot be merged without its generated SQL. It runs
// `drizzle-kit generate` against a copy of migrations/ and checks that
// nothing new is written. Part of `bun run validate` (`bun run db:check`).
import { cpSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const packageDir = join(import.meta.dir, '..');
// drizzle-kit needs `--out` relative to the working directory.
const scratch = 'node_modules/.cache/db-check/migrations';
const scratchDir = join(packageDir, scratch);

const sqlFiles = (dir: string) =>
  readdirSync(dir).filter((name) => name.endsWith('.sql'));

rmSync(scratchDir, { recursive: true, force: true });
cpSync(join(packageDir, 'migrations'), scratchDir, { recursive: true });
const before = sqlFiles(scratchDir).length;
const result = Bun.spawnSync(
  [
    'bunx',
    'drizzle-kit',
    'generate',
    '--dialect=sqlite',
    '--schema=./src/db/schema.ts',
    `--out=./${scratch}`,
  ],
  { cwd: packageDir, stdout: 'pipe', stderr: 'pipe' },
);
const added = sqlFiles(scratchDir).slice(before);
rmSync(scratchDir, { recursive: true, force: true });

if (result.exitCode !== 0) {
  console.error(result.stdout.toString(), result.stderr.toString());
  console.error('db:check: drizzle-kit generate failed');
  process.exit(1);
}
if (added.length > 0) {
  console.error(
    `db:check: src/db/schema.ts has changes without a migration (${added.join(', ')} would be generated). Run \`bun run db:generate\` and commit the SQL.`,
  );
  process.exit(1);
}
console.log('db:check: migrations match src/db/schema.ts');
