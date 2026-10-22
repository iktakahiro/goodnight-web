// Fails when code in packages/server builds SQL outside Drizzle's query
// builder and `sql` template (docs/decisions/0005). Part of
// `bun run validate`; the self-test is scripts/check-sql.test.ts.
//
//   bun scripts/check-sql.ts
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** A forbidden SQL construct. */
export interface SqlRule {
  name: string;
  pattern: RegExp;
  reason: string;
}

/** Constructs that app code must not use. */
export const SQL_RULES: readonly SqlRule[] = [
  {
    name: 'sql.raw(',
    pattern: /\bsql\s*(?:\.\s*raw|\[\s*['"`]raw['"`]\s*\])\s*\(/g,
    reason: 'inserts text into SQL unescaped; use the sql`` template',
  },
  {
    name: '.prepare(',
    pattern: /\.\s*prepare\s*\(/g,
    reason: 'builds a D1 statement directly; use the Drizzle query builder',
  },
  {
    name: '$client',
    pattern: /\$client\b/g,
    reason: 'reaches the raw D1 binding behind Drizzle',
  },
];

/** Paths (relative to the repository, `/`-separated) that may break the rules. */
export const SQL_ALLOWLIST: readonly { pattern: RegExp; reason: string }[] = [
  {
    pattern: /^packages\/server\/src\/testing\//,
    reason: 'test-only D1 stand-ins and helpers',
  },
  {
    pattern: /^packages\/server\/e2e\//,
    reason: 'end-to-end test harness (runs SQL through wrangler)',
  },
  {
    pattern: /\.test\.tsx?$/,
    reason: 'tests set up and inspect the database directly',
  },
];

/** Directories that are scanned. */
export const SQL_SCAN_ROOTS: readonly string[] = ['packages/server'];

const SKIPPED_DIRS = new Set(['node_modules', 'dist', '.wrangler', '.turbo']);
const SOURCE_FILE = /\.(?:ts|tsx|mts|js|mjs)$/;

/** A rule match in a file. */
export interface SqlViolation {
  path: string;
  line: number;
  rule: string;
  reason: string;
}

/** Returns whether a repository-relative path may break the rules. */
export const isAllowlisted = (path: string): boolean =>
  SQL_ALLOWLIST.some(({ pattern }) => pattern.test(path));

/** Returns every rule match in one file's source. */
export const findSqlViolations = (
  path: string,
  source: string,
): SqlViolation[] => {
  const violations: SqlViolation[] = [];
  for (const rule of SQL_RULES) {
    for (const match of source.matchAll(rule.pattern)) {
      const line = source.slice(0, match.index).split('\n').length;
      violations.push({ path, line, rule: rule.name, reason: rule.reason });
    }
  }
  return violations;
};

const listFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      return SKIPPED_DIRS.has(entry.name) || entry.name.startsWith('.')
        ? []
        : listFiles(join(dir, entry.name));
    }
    return SOURCE_FILE.test(entry.name) ? [join(dir, entry.name)] : [];
  });

/** Scans {@link SQL_SCAN_ROOTS} under `repoRoot`, skipping allowlisted files. */
export const scanRepository = (repoRoot: string): SqlViolation[] =>
  SQL_SCAN_ROOTS.flatMap((root) => listFiles(join(repoRoot, root)))
    .map((file) => relative(repoRoot, file).split(sep).join('/'))
    .filter((path) => !isAllowlisted(path))
    .flatMap((path) =>
      findSqlViolations(path, readFileSync(join(repoRoot, path), 'utf8')),
    );

if (import.meta.main) {
  const violations = scanRepository(join(import.meta.dir, '..'));
  for (const v of violations) {
    console.error(`${v.path}:${v.line}: ${v.rule} ${v.reason}`);
  }
  if (violations.length > 0) {
    console.error(
      `check-sql: ${violations.length} forbidden SQL construct(s). See docs/decisions/0005-drizzle-orm.md.`,
    );
    process.exit(1);
  }
  console.log('check-sql: no forbidden SQL constructs');
}
