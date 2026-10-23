import { describe, expect, test } from 'bun:test';
import {
  checkPackedManifest,
  checkServerManifest,
  checkStarterLockfile,
  checkStarterManifest,
  checkTarballFiles,
  parsePackJson,
  parseTarList,
  tarballArgument,
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

describe('parsePackJson', () => {
  const entry = {
    name: '@goodnight-web/server',
    files: [{ path: 'README.md' }, { path: 'src/index.ts' }],
  };
  const expected = ['package/README.md', 'package/src/index.ts'];

  test('reads the array that npm 11 and earlier print', () => {
    expect(parsePackJson(JSON.stringify([entry]))).toEqual(expected);
  });

  test('reads the object keyed by package name that npm 12 prints', () => {
    expect(
      parsePackJson(JSON.stringify({ '@goodnight-web/server': entry })),
    ).toEqual(expected);
  });

  test('throws with the raw output for an empty object', () => {
    expect(() => parsePackJson('{}')).toThrow(/unexpected output.*\{\}/);
  });

  test('throws with the raw output for text that is not JSON', () => {
    expect(() => parsePackJson('npm warn something')).toThrow(
      /npm warn something/,
    );
  });

  test('throws for an entry without files and for a malformed file', () => {
    expect(() => parsePackJson('[{"name":"x"}]')).toThrow(/unexpected output/);
    expect(() => parsePackJson('[{"files":[{"size":1}]}]')).toThrow(
      /unexpected output/,
    );
  });

  test('truncates long output in the error', () => {
    const long = 'x'.repeat(2000);
    expect(() => parsePackJson(long)).toThrow(/2000 characters/);
  });
});

describe('parseTarList', () => {
  test('lists files and leaves out directories', () => {
    expect(
      parseTarList(
        'package/\npackage/package.json\r\npackage/src/\npackage/src/index.ts\n',
      ),
    ).toEqual(['package/package.json', 'package/src/index.ts']);
  });
});

describe('checkPackedManifest', () => {
  test('accepts the server manifest at the expected version', () => {
    expect(checkPackedManifest(server, '0.1.0')).toEqual([]);
  });

  test('rejects another version and leftover workspace ranges', () => {
    const problems = checkPackedManifest(
      { ...server, devDependencies: { tsconfig: 'workspace:*' } },
      '0.2.0',
    );
    expect(problems).toHaveLength(2);
    expect(problems.join('\n')).toContain('0.2.0');
    expect(problems.join('\n')).toContain('workspace:*');
  });
});

describe('tarballArgument', () => {
  test('reads --tarball <path>, --tarball=<path>, and the environment', () => {
    expect(tarballArgument(['--tarball', 'a.tgz'], {})).toBe('a.tgz');
    expect(tarballArgument(['--tarball=b.tgz'], {})).toBe('b.tgz');
    expect(tarballArgument([], { CHECK_RELEASE_TARBALL: 'c.tgz' })).toBe(
      'c.tgz',
    );
    expect(tarballArgument([], {})).toBeUndefined();
    expect(tarballArgument([], { CHECK_RELEASE_TARBALL: '' })).toBeUndefined();
  });

  test('fails without a path', () => {
    expect(() => tarballArgument(['--tarball'], {})).toThrow('.tgz');
    expect(() => tarballArgument(['--tarball', '--x'], {})).toThrow('.tgz');
  });
});

describe('checkStarterLockfile', () => {
  const starter: PackageJson = {
    dependencies: { '@goodnight-web/server': '0.1.0', astro: '7.4.1' },
    devDependencies: { wrangler: '4.151.3' },
  };
  const entry = (name: string, version: string) => ({
    version,
    resolved: `https://registry.npmjs.org/${name}/-/${name.split('/').pop()}-${version}.tgz`,
    integrity: 'sha512-abc',
  });
  const lock = (packages: Record<string, unknown> = {}) => ({
    name: 'goodnight-web-starter',
    lockfileVersion: 3,
    packages: {
      '': {
        name: 'goodnight-web-starter',
        dependencies: { astro: '7.4.1', '@goodnight-web/server': '0.1.0' },
        devDependencies: { wrangler: '4.151.3' },
      },
      'node_modules/@goodnight-web/server': entry(
        '@goodnight-web/server',
        '0.1.0',
      ),
      'node_modules/astro': entry('astro', '7.4.1'),
      'node_modules/wrangler': entry('wrangler', '4.151.3'),
      'node_modules/x/node_modules/bundled': {
        version: '1.0.0',
        inBundle: true,
      },
      ...packages,
    },
  });

  test('accepts a lockfile in step with package.json', () => {
    expect(checkStarterLockfile(lock(), starter, '0.1.0')).toEqual([]);
  });

  test('requires the file', () => {
    expect(checkStarterLockfile(undefined, starter, '0.1.0')).toHaveLength(1);
  });

  test('rejects dependencies that differ from package.json', () => {
    const problems = checkStarterLockfile(
      lock(),
      { ...starter, devDependencies: { wrangler: '4.152.0' } },
      '0.1.0',
    );
    expect(problems.join('\n')).toContain('devDependencies differ');
  });

  test('rejects a locked server version other than the pin and the package', () => {
    expect(
      checkStarterLockfile(
        lock({
          'node_modules/@goodnight-web/server': entry(
            '@goodnight-web/server',
            '0.0.9',
          ),
        }),
        starter,
        '0.1.0',
      ).join('\n'),
    ).toContain('locks @goodnight-web/server 0.0.9');
    expect(checkStarterLockfile(lock(), starter, '0.2.0')).toHaveLength(1);
  });

  test.each([
    ['a workspace link', { resolved: 'packages/server', link: true }],
    ['a file: version', { ...entry('a', '1.0.0'), version: 'file:../a' }],
    [
      'a git URL',
      {
        version: '1.0.0',
        resolved: 'git+https://github.com/a/a.git',
        integrity: 'sha512-x',
      },
    ],
    [
      'another registry',
      {
        version: '1.0.0',
        resolved: 'https://registry.example/a/-/a-1.0.0.tgz',
        integrity: 'sha512-x',
      },
    ],
    [
      'plain http',
      {
        version: '1.0.0',
        resolved: 'http://registry.npmjs.org/a/-/a-1.0.0.tgz',
        integrity: 'sha512-x',
      },
    ],
    [
      'no integrity',
      {
        version: '1.0.0',
        resolved: 'https://registry.npmjs.org/a/-/a-1.0.0.tgz',
      },
    ],
    [
      'a sha1 integrity',
      {
        version: '1.0.0',
        resolved: 'https://registry.npmjs.org/a/-/a-1.0.0.tgz',
        integrity: 'sha1-x',
      },
    ],
  ])('rejects %s', (_name, bad) => {
    const problems = checkStarterLockfile(
      lock({ 'node_modules/a': bad }),
      starter,
      '0.1.0',
    );
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join('\n')).toContain('node_modules/a');
  });

  test('rejects an old lockfile version', () => {
    expect(
      checkStarterLockfile({ ...lock(), lockfileVersion: 1 }, starter, '0.1.0'),
    ).toHaveLength(1);
  });
});
