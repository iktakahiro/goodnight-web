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

function modified(filename: string, patch: string): ChangedFile {
  return { filename, status: 'modified', patch };
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
    const result = classifyUpdate(pullRequest(), [
      modified('package.json', packageJsonPatch),
      modified('package-lock.json', packageLockPatch),
    ]);
    expect(result).toEqual({ official: true, reasons: [] });
  });

  test('Dependabot update that also changes other dependencies', () => {
    const result = classifyUpdate(pullRequest(), [
      modified(
        'package.json',
        `@@ -11,8 +11,8 @@
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
    const result = classifyUpdate(pullRequest(), [
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
    const result = classifyUpdate(pullRequest(), [
      modified('package.json', packageJsonPatch),
      { filename: 'bun.lock', status: 'modified' },
    ]);
    expect(result).toEqual({ official: true, reasons: [] });
  });

  test('author other than dependabot[bot]', () => {
    const result = classifyUpdate(
      pullRequest({ user: { login: 'someone', type: 'User' } }),
      [modified('package.json', packageJsonPatch)],
    );
    expect(result.official).toBe(false);
    expect(result.reasons).toEqual(['author is not dependabot[bot]: someone']);
  });

  test('a user account named like the bot is not official', () => {
    const result = classifyUpdate(
      pullRequest({ user: { login: 'dependabot[bot]', type: 'User' } }),
      [modified('package.json', packageJsonPatch)],
    );
    expect(result.official).toBe(false);
  });

  test('branch from a fork', () => {
    const result = classifyUpdate(
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
    const result = classifyUpdate(
      pullRequest({ head: { sha: 'abc', repo: null } }),
      [modified('package.json', packageJsonPatch)],
    );
    expect(result.official).toBe(false);
  });

  test('extra files changed', () => {
    const result = classifyUpdate(pullRequest(), [
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
    const result = classifyUpdate(pullRequest(), [
      modified('tools/package.json', packageJsonPatch),
    ]);
    expect(result.official).toBe(false);
  });

  test('lockfile-only change is not official', () => {
    const result = classifyUpdate(pullRequest(), [
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
    const result = classifyUpdate(pullRequest(), [
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
    const result = classifyUpdate(pullRequest(), [
      modified(
        'package.json',
        `@@ -5,7 +5,7 @@
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
    const result = classifyUpdate(pullRequest(), [
      modified(
        'package.json',
        `@@ -11,3 +11,3 @@
-    "@goodnight-web/server": "0.1.0",
+    "@goodnight-web/server": "github:attacker/server",`,
      ),
    ]);
    expect(result.official).toBe(false);
    expect(result.reasons[0]).toContain('is not set to a version number');
  });

  test('a package.json diff that GitHub did not include is not official', () => {
    const result = classifyUpdate(pullRequest(), [
      { filename: 'package.json', status: 'modified' },
      modified('package-lock.json', packageLockPatch),
    ]);
    expect(result.official).toBe(false);
    expect(result.reasons).toContain(
      'the diff of package.json is not available',
    );
  });

  test('an added lockfile is not official', () => {
    const result = classifyUpdate(pullRequest(), [
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
    expect(classifyUpdate(pullRequest(), []).official).toBe(false);
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

  function fakeToolkit(comments: Comment[], files: ChangedFile[]) {
    const calls: { method: string; params: Record<string, unknown> }[] = [];
    const listFiles = Symbol('listFiles');
    const listComments = Symbol('listComments');
    const toolkit = {
      github: {
        paginate: async (method: unknown) =>
          method === listFiles ? files : comments,
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
        payload: { pull_request: pullRequest() },
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
});
