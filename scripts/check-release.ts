// Fails when `@goodnight-web/server` cannot be published, or when
// `templates/starter` cannot be used outside this monorepo. The Deploy to
// Cloudflare button copies `templates/starter` alone as the root of a new
// repository, so the starter must install `@goodnight-web/server` from npm.
// Inside this repository, bun links the workspace package because the
// starter pins the exact version of the workspace. Part of `bun run validate`
// and CI (after the build, because the tarball needs the generated files).
//
//   bun scripts/check-release.ts
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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

/** The tarball's file list from `npm pack --dry-run` (no scripts, no write). */
const listTarball = (packageDir: string): string[] => {
  const output = execFileSync(
    'npm',
    ['pack', '--dry-run', '--json', '--ignore-scripts'],
    { cwd: packageDir, encoding: 'utf8' },
  );
  const [result] = JSON.parse(output) as { files: { path: string }[] }[];
  return (result?.files ?? []).map((file) => `package/${file.path}`);
};

if (import.meta.main) {
  const root = join(import.meta.dir, '..');
  const serverDir = join(root, 'packages/server');
  const server = readJson(join(serverDir, 'package.json'));
  const starter = readJson(join(root, 'templates/starter/package.json'));
  const migrations = readdirSync(join(serverDir, 'migrations')).filter((name) =>
    name.endsWith('.sql'),
  );

  const problems = [
    ...checkServerManifest(server).map((p) => `packages/server: ${p}`),
    ...checkStarterManifest(starter, server.version).map(
      (p) => `templates/starter: ${p}`,
    ),
    ...checkTarballFiles(listTarball(serverDir), migrations).map(
      (p) => `packages/server tarball: ${p}`,
    ),
  ];
  if (problems.length > 0) {
    console.error(problems.map((p) => `- ${p}`).join('\n'));
    process.exit(1);
  }
  console.log(
    `release check: ${SERVER}@${server.version} is publishable and the starter pins it`,
  );
}
