import { describe, expect, test } from 'bun:test';
import {
  checkServerManifest,
  checkStarterManifest,
  checkTarballFiles,
  type PackageJson,
} from './check-release.ts';

const server: PackageJson = {
  name: '@goodnight-web/server',
  version: '0.1.0',
  license: 'MIT',
  publishConfig: { access: 'public' },
  scripts: { prepack: 'bun run build' },
  dependencies: { hono: '4.13.13' },
};

describe('checkServerManifest', () => {
  test('accepts a publishable manifest', () => {
    expect(checkServerManifest(server)).toEqual([]);
  });

  test('rejects private, a missing prepack, and local dependencies', () => {
    const problems = checkServerManifest({
      ...server,
      private: true,
      scripts: {},
      dependencies: { local: 'workspace:*' },
    });
    expect(problems).toHaveLength(3);
  });
});

describe('checkStarterManifest', () => {
  test('accepts the exact version of the server package', () => {
    expect(
      checkStarterManifest(
        { dependencies: { '@goodnight-web/server': '0.1.0' } },
        '0.1.0',
      ),
    ).toEqual([]);
  });

  test('rejects workspace:*, a range, and another version', () => {
    for (const range of ['workspace:*', '^0.1.0', '0.0.9']) {
      expect(
        checkStarterManifest(
          { dependencies: { '@goodnight-web/server': range } },
          '0.1.0',
        ).length,
      ).toBeGreaterThan(0);
    }
  });
});

describe('checkTarballFiles', () => {
  const files = [
    'package/package.json',
    'package/README.md',
    'package/LICENSE',
    'package/src/index.ts',
    'package/src/client.ts',
    'package/src/features/admin-ui/admin-files.gen.ts',
    'package/src/features/admin-ui/admin-messages.gen.json',
    'package/migrations/0000_initial.sql',
  ];

  test('accepts a complete tarball', () => {
    expect(checkTarballFiles(files, ['0000_initial.sql'])).toEqual([]);
  });

  test('reports a missing generated file, a migration, and a test file', () => {
    const problems = checkTarballFiles(
      [
        ...files.filter((f) => !f.endsWith('admin-files.gen.ts')),
        'package/src/a.test.ts',
      ],
      ['0000_initial.sql', '0001_next.sql'],
    );
    expect(problems).toHaveLength(3);
  });
});
