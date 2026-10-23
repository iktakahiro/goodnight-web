// Fails when `@goodnight-web/server` cannot be published, or when
// `templates/starter` cannot be used outside this monorepo. The Deploy to
// Cloudflare button copies `templates/starter` alone as the root of a new
// repository, so the starter must install `@goodnight-web/server` from npm.
// Inside this repository, bun links the workspace package because the
// starter pins the exact version of the workspace. The starter's
// package-lock.json (used by `npm ci` in Workers Builds) must match its
// package.json and lock that same version from the npm registry. Part of
// `bun run validate`
// and CI (after the build, because the tarball needs the generated files).
//
//   bun scripts/check-release.ts
//   bun scripts/check-release.ts --tarball packages/server/goodnight-web-server-0.1.0.tgz
//
// Without `--tarball` (or `CHECK_RELEASE_TARBALL`), the tarball check uses the
// file list of `npm pack --dry-run`. With it, the check reads the given .tgz,
// the exact file that `npm publish` would upload, including its package.json.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SERVER = '@goodnight-web/server';
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const LOCAL_PROTOCOL = /^(?:workspace|file|link|portal):/;

/** The parts of a package.json that the checks read. */
export interface PackageJson {
  name?: string;
  version?: string;
  private?: boolean;
  license?: string;
  publishConfig?: { access?: string };
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/** Problems that keep the server package from being published. */
export const checkServerManifest = (pkg: PackageJson): string[] => {
  const problems: string[] = [];
  if (pkg.name !== SERVER) problems.push(`name must be ${SERVER}`);
  if (pkg.private) problems.push('"private" must not be true');
  if (!pkg.version || !EXACT_VERSION.test(pkg.version)) {
    problems.push('"version" must be a plain version such as 0.1.0');
  }
  if (pkg.license !== 'MIT') problems.push('"license" must be MIT');
  if (pkg.publishConfig?.access !== 'public') {
    problems.push('"publishConfig.access" must be "public"');
  }
  if (!pkg.scripts?.prepack) {
    problems.push(
      '"scripts.prepack" must build the generated files (admin UI module)',
    );
  }
  for (const [name, range] of Object.entries(pkg.dependencies ?? {})) {
    if (LOCAL_PROTOCOL.test(range)) {
      problems.push(`dependency ${name} must not use "${range}"`);
    }
  }
  return problems;
};

/** Problems that keep the starter from working when copied out alone. */
export const checkStarterManifest = (
  starter: PackageJson,
  serverVersion: string | undefined,
): string[] => {
  const problems: string[] = [];
  const all = { ...starter.devDependencies, ...starter.dependencies };
  for (const [name, range] of Object.entries(all)) {
    if (LOCAL_PROTOCOL.test(range)) {
      problems.push(
        `${name} is "${range}", which does not install outside the monorepo`,
      );
    }
  }
  const pinned = starter.dependencies?.[SERVER];
  if (pinned !== serverVersion) {
    problems.push(
      `${SERVER} must be pinned to ${serverVersion} (the version in packages/server/package.json), ` +
        `but the starter has ${pinned ?? 'nothing'}. Bump both together; a different version ` +
        'makes bun install it from npm instead of linking the workspace.',
    );
  }
  return problems;
};

/** The registry that every locked package must come from. */
export const NPM_REGISTRY = 'https://registry.npmjs.org/';

const sameEntries = (
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
): boolean => {
  const left = Object.entries(a ?? {}).sort(([x], [y]) => x.localeCompare(y));
  const right = Object.entries(b ?? {}).sort(([x], [y]) => x.localeCompare(y));
  return JSON.stringify(left) === JSON.stringify(right);
};

/**
 * Problems in `templates/starter/package-lock.json`, offline. Workers Builds
 * runs `npm ci` from it, so it must match `package.json` exactly, lock the
 * server version that the starter pins, and resolve every package from the
 * npm registry with a sha512 integrity: no `link`, `file:`, `git+`, or
 * workspace entries that would only work inside this monorepo. Entries that
 * ship inside another package (`inBundle`) have no URL of their own.
 *
 * @param lock - The parsed lockfile, or `undefined` when the file is missing.
 */
export const checkStarterLockfile = (
  lock: unknown,
  starter: PackageJson,
  serverVersion: string | undefined,
): string[] => {
  if (lock === undefined) {
    return [
      'package-lock.json is missing; Workers Builds needs it for `npm ci` (docs/starter.md)',
    ];
  }
  if (!isRecord(lock) || !isRecord(lock.packages)) {
    return ['package-lock.json has no "packages" object'];
  }
  const problems: string[] = [];
  if (lock.lockfileVersion !== 3) {
    problems.push(
      `package-lock.json must be lockfileVersion 3 (npm 10), not ${String(lock.lockfileVersion)}`,
    );
  }
  const root = lock.packages[''];
  const rootEntry = isRecord(root) ? (root as PackageJson) : {};
  if (!sameEntries(rootEntry.dependencies, starter.dependencies)) {
    problems.push(
      'package-lock.json dependencies differ from package.json; run `npm install` in a copy of the starter',
    );
  }
  if (!sameEntries(rootEntry.devDependencies, starter.devDependencies)) {
    problems.push(
      'package-lock.json devDependencies differ from package.json; run `npm install` in a copy of the starter',
    );
  }
  const server = lock.packages[`node_modules/${SERVER}`];
  const locked = isRecord(server) ? server.version : undefined;
  if (locked !== starter.dependencies?.[SERVER] || locked !== serverVersion) {
    problems.push(
      `package-lock.json locks ${SERVER} ${String(locked ?? 'nothing')}, but the starter pins ` +
        `${starter.dependencies?.[SERVER] ?? 'nothing'} and packages/server is ${serverVersion ?? 'unknown'}`,
    );
  }
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (path === '') continue;
    if (!isRecord(entry)) {
      problems.push(`package-lock.json entry ${path} is not an object`);
      continue;
    }
    if (entry.link === true) {
      problems.push(`package-lock.json entry ${path} is a link`);
      continue;
    }
    if (
      typeof entry.version === 'string' &&
      LOCAL_PROTOCOL.test(entry.version)
    ) {
      problems.push(
        `package-lock.json entry ${path} has version "${entry.version}"`,
      );
    }
    if (entry.inBundle === true) continue;
    const resolved = entry.resolved;
    if (typeof resolved !== 'string' || !resolved.startsWith(NPM_REGISTRY)) {
      problems.push(
        `package-lock.json entry ${path} resolves to ${String(resolved ?? 'nothing')}, not ${NPM_REGISTRY}`,
      );
    }
    if (
      typeof entry.integrity !== 'string' ||
      !entry.integrity.startsWith('sha512-')
    ) {
      problems.push(`package-lock.json entry ${path} has no sha512 integrity`);
    }
  }
  return problems;
};

/** Files that must be in the published tarball, as patterns. */
export const REQUIRED_TARBALL_FILES: readonly RegExp[] = [
  /^package\/package\.json$/,
  /^package\/README\.md$/,
  /^package\/LICENSE$/,
  /^package\/src\/index\.ts$/,
  /^package\/src\/client\.ts$/,
  /^package\/src\/features\/admin-ui\/admin-files\.gen\.ts$/,
  /^package\/src\/features\/admin-ui\/admin-messages\.gen\.json$/,
  /^package\/migrations\/0000_[^/]+\.sql$/,
];

/** Problems in the list of files that `npm pack` would put in the tarball. */
export const checkTarballFiles = (
  files: readonly string[],
  migrationsOnDisk: readonly string[],
): string[] => {
  const problems: string[] = [];
  for (const pattern of REQUIRED_TARBALL_FILES) {
    if (!files.some((file) => pattern.test(file))) {
      problems.push(`the tarball has no file matching ${pattern}`);
    }
  }
  for (const migration of migrationsOnDisk) {
    if (!files.includes(`package/migrations/${migration}`)) {
      problems.push(`the tarball is missing migrations/${migration}`);
    }
  }
  for (const file of files) {
    if (/\.test\.ts$/.test(file) || file.startsWith('package/src/testing/')) {
      problems.push(`the tarball must not contain ${file}`);
    }
  }
  return problems;
};

const readJson = (path: string): PackageJson =>
  JSON.parse(readFileSync(path, 'utf8')) as PackageJson;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const OUTPUT_LIMIT = 500;

const unexpectedOutput = (output: string): Error =>
  new Error(
    `unexpected output from \`npm pack --dry-run --json\`: ${
      output.length > OUTPUT_LIMIT
        ? `${output.slice(0, OUTPUT_LIMIT)}... (${output.length} characters)`
        : output
    }`,
  );

/**
 * The file list from the JSON that `npm pack --dry-run --json` prints. npm 11
 * and earlier print an array with one entry per package; npm 12 prints an
 * object keyed by package name. Throws, with the raw output, for any other
 * shape.
 */
export const parsePackJson = (output: string): string[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw unexpectedOutput(output);
  }
  const entries: unknown[] = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed)
      ? Object.values(parsed)
      : [];
  const [entry] = entries;
  if (entries.length !== 1 || !isRecord(entry) || !Array.isArray(entry.files)) {
    throw unexpectedOutput(output);
  }
  return entry.files.map((file: unknown) => {
    if (!isRecord(file) || typeof file.path !== 'string') {
      throw unexpectedOutput(output);
    }
    return `package/${file.path}`;
  });
};

/**
 * The file list from `tar -tzf` of a packed tarball: one path per line;
 * directory entries (ending in `/`) are left out.
 */
export const parseTarList = (output: string): string[] =>
  output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.endsWith('/'));

/**
 * Problems in the package.json inside a packed tarball: it must be the
 * publishable server manifest ({@link checkServerManifest}) at
 * `expectedVersion`, with no local protocol left in any dependency list.
 */
export const checkPackedManifest = (
  pkg: PackageJson,
  expectedVersion: string | undefined,
): string[] => {
  const problems = checkServerManifest(pkg);
  if (pkg.version !== expectedVersion) {
    problems.push(
      `the packed version is ${pkg.version ?? 'missing'}, but packages/server/package.json has ${expectedVersion ?? 'nothing'}`,
    );
  }
  for (const [name, range] of Object.entries(pkg.devDependencies ?? {})) {
    if (LOCAL_PROTOCOL.test(range)) {
      problems.push(`devDependency ${name} must not use "${range}"`);
    }
  }
  return problems;
};

/**
 * The tarball path from `--tarball <path>`, `--tarball=<path>`, or the
 * `CHECK_RELEASE_TARBALL` environment variable, or `undefined`.
 */
export const tarballArgument = (
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): string | undefined => {
  const index = argv.indexOf('--tarball');
  if (index !== -1) {
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error('--tarball needs the path of a .tgz file');
    }
    return value;
  }
  const inline = argv.find((arg) => arg.startsWith('--tarball='));
  if (inline) return inline.slice('--tarball='.length);
  return env.CHECK_RELEASE_TARBALL || undefined;
};

/** The file list and package.json of a packed tarball, read with `tar`. */
const readTarball = (
  path: string,
): { files: string[]; manifest: PackageJson } => ({
  files: parseTarList(
    execFileSync('tar', ['-tzf', path], { encoding: 'utf8' }),
  ),
  manifest: JSON.parse(
    execFileSync('tar', ['-xzOf', path, 'package/package.json'], {
      encoding: 'utf8',
    }),
  ) as PackageJson,
});

/** The tarball's file list from `npm pack --dry-run` (no scripts, no write). */
const listTarball = (packageDir: string): string[] =>
  parsePackJson(
    execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
      cwd: packageDir,
      encoding: 'utf8',
    }),
  );

if (import.meta.main) {
  const root = join(import.meta.dir, '..');
  const serverDir = join(root, 'packages/server');
  const server = readJson(join(serverDir, 'package.json'));
  const starter = readJson(join(root, 'templates/starter/package.json'));
  const lockPath = join(root, 'templates/starter/package-lock.json');
  const lock: unknown = existsSync(lockPath)
    ? JSON.parse(readFileSync(lockPath, 'utf8'))
    : undefined;
  const migrations = readdirSync(join(serverDir, 'migrations')).filter((name) =>
    name.endsWith('.sql'),
  );

  const tarball = tarballArgument(process.argv.slice(2), process.env);
  const packed = tarball ? readTarball(resolve(tarball)) : undefined;

  const problems = [
    ...checkServerManifest(server).map((p) => `packages/server: ${p}`),
    ...checkStarterManifest(starter, server.version).map(
      (p) => `templates/starter: ${p}`,
    ),
    ...checkStarterLockfile(lock, starter, server.version).map(
      (p) => `templates/starter: ${p}`,
    ),
    ...checkTarballFiles(
      packed?.files ?? listTarball(serverDir),
      migrations,
    ).map((p) => `packages/server tarball: ${p}`),
    ...(packed
      ? checkPackedManifest(packed.manifest, server.version).map(
          (p) => `${tarball}: ${p}`,
        )
      : []),
  ];
  if (problems.length > 0) {
    console.error(problems.map((p) => `- ${p}`).join('\n'));
    process.exit(1);
  }
  console.log(
    `release check: ${SERVER}@${server.version} is publishable, and the starter pins and locks it` +
      (tarball ? ` (checked ${tarball})` : ''),
  );
}
