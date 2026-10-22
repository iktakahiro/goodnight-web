import { describe, expect, test } from 'bun:test';
import { MARKER, buildComment, classifyUpdate, run } from './update-check.cjs';

type PullRequest = Parameters<typeof classifyUpdate>[0];
type ChangedFile = Parameters<typeof classifyUpdate>[1][number];

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

// The event payload reports `changed_files`; by default it matches the list.
function classify(pr: PullRequest, files: ChangedFile[]) {
  return classifyUpdate({ changed_files: files.length, ...pr }, files);
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
@@ -400,7 +400,7 @@
     "node_modules/hono": {
-      "version": "4.13.13",
+      "version": "4.13.14",
       "license": "MIT",`,
      ),
    ]);
    expect(result).toEqual({ official: true, reasons: [] });
  });

  test('a lockfile diff that GitHub did not include is allowed', () => {
    const result = classify(pullRequest(), [
      modified('package.json', packageJsonPatch),
      { filename: 'bun.lock', status: 'modified' },
    ]);
    expect(result).toEqual({ official: true, reasons: [] });
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
        head: { sha: 'abc', repo: { full_name: 'attacker/website' } },
      }),
      [modified('package.json', packageJsonPatch)],
    );
    expect(result.official).toBe(false);
    expect(result.reasons).toEqual([
      'branch is not in this repository: attacker/website',
    ]);
  });

  test('branch from a deleted fork', () => {
    const result = classify(pullRequest({ head: { sha: 'abc', repo: null } }), [
      modified('package.json', packageJsonPatch),
    ]);
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
        `@@ -50,3 +50,3 @@
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
      const result = classifyUpdate(pullRequest({ changed_files }), files);
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
    expect(body).toContain('- author is not dependabot[bot]: someone');
  });
});

describe('run', () => {
  type Comment = { id: number; body: string; user: { login: string } };

  function fakeToolkit(comments: Comment[], files: ChangedFile[] | Error) {
    const calls: { method: string; params: Record<string, unknown> }[] = [];
    const listFiles = Symbol('listFiles');
    const listComments = Symbol('listComments');
    const toolkit = {
      github: {
        paginate: async (method: unknown) => {
          if (method !== listFiles) return comments;
          if (files instanceof Error) throw files;
          return files;
        },
        rest: {
          pulls: { listFiles },
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
          }),
        },
        repo: { owner: 'example-co', repo: 'website' },
      },
      core: { info: () => {} },
    };
    return { toolkit, calls };
  }

  const files = [modified('package.json', packageJsonPatch)];

  test('creates the comment when there is none', async () => {
    const { toolkit, calls } = fakeToolkit([], files);
    const result = await run(toolkit);
    expect(result.official).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('createComment');
    expect(calls[0]?.params.issue_number).toBe(7);
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
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('updateComment');
    expect(calls[0]?.params.comment_id).toBe(2);
  });

  test('does nothing when the comment is already up to date', async () => {
    const body = buildComment(
      { official: true, reasons: [] },
      '0123456789abcdef',
    );
    const { toolkit, calls } = fakeToolkit(
      [{ id: 2, body, user: { login: 'github-actions[bot]' } }],
      files,
    );
    await run(toolkit);
    expect(calls).toHaveLength(0);
  });

  test('replaces an official comment with the warning when files cannot be listed', async () => {
    const official = buildComment(
      { official: true, reasons: [] },
      '0123456789abcdef',
    );
    const { toolkit, calls } = fakeToolkit(
      [{ id: 2, body: official, user: { login: 'github-actions[bot]' } }],
      new Error('API rate limit exceeded'),
    );
    await expect(run(toolkit)).rejects.toThrow('API rate limit exceeded');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('updateComment');
    expect(calls[0]?.params.body).toContain('This is not an official update');
    expect(calls[0]?.params.body).toContain(
      'the list of changed files could not be read',
    );
  });
});
