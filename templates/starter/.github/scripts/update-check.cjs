// @ts-check
// Classifies a pull request as an official goodnight-web update or not, and
// posts one comment with the result. Used by .github/workflows/update-check.yml.
//
// This file runs from the base branch. It only reads pull request metadata and
// the changed-file list through the GitHub API. It never runs code from the
// pull request. Do not edit it unless you know what you are doing.
'use strict';

/** Hidden marker that identifies the comment this script owns. */
const MARKER = '<!-- goodnight-web:update-check -->';

/** The only author an official update can come from. */
const OFFICIAL_AUTHOR = 'dependabot[bot]';

/** The login of the account that posts the comment with `GITHUB_TOKEN`. */
const COMMENT_AUTHOR = 'github-actions[bot]';

/** Package scope of official goodnight-web packages. */
const OFFICIAL_SCOPE = '@goodnight-web/';

/** Lockfiles an official update may change. */
const LOCKFILES = ['package-lock.json', 'bun.lock', 'pnpm-lock.yaml'];

/** Every file an official update may change. Paths are from the repository root. */
const ALLOWED_FILES = ['package.json', ...LOCKFILES];

// Keys in package-lock.json and pnpm-lock.yaml that describe a package
// instead of naming one. A changed line with such a key belongs to the
// package entry above it.
const LOCKFILE_METADATA_KEYS = new Set([
  'version',
  'resolved',
  'integrity',
  'license',
  'dev',
  'optional',
  'devOptional',
  'peer',
  'engines',
  'node',
  'npm',
  'bin',
  'funding',
  'url',
  'type',
  'cpu',
  'os',
  'libc',
  'hasBin',
  'hasInstallScript',
  'hasShrinkwrap',
  'inBundle',
  'deprecated',
  'requiresBuild',
  'specifier',
  'resolution',
  'tarball',
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
  'peerDependenciesMeta',
  'bundleDependencies',
  'bundledDependencies',
  'transitivePeerDependencies',
]);

// An exact or caret/tilde semver version, as Dependabot writes it.
const VERSION_SPEC =
  /^[\^~]?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/**
 * @typedef {object} PullRequestInfo
 * The fields of `github.event.pull_request` this script reads.
 * @property {number} number
 * @property {{ login: string, type: string } | null} user
 * @property {{ sha: string, repo: { full_name: string } | null }} head
 * @property {{ repo: { full_name: string } }} base
 */

/**
 * @typedef {object} ChangedFile
 * One entry of the "List pull request files" API response.
 * @property {string} filename
 * @property {string} status `added`, `removed`, `modified`, `renamed`, ...
 * @property {string} [patch] The unified diff. GitHub omits it for large diffs.
 */

/**
 * @typedef {object} Classification
 * @property {boolean} official True only when every rule passed.
 * @property {string[]} reasons Why the update is not official. Empty when official.
 */

/**
 * Decides whether a pull request is an official goodnight-web update.
 *
 * It is official only when all of these are true:
 * - the author is `dependabot[bot]` and the account type is `Bot`;
 * - the branch is in this repository, not in a fork;
 * - the only changed files are `package.json` and lockfiles at the root, and
 *   they were modified (not added, removed, or renamed);
 * - every changed line in those files belongs to an `@goodnight-web/*`
 *   package.
 *
 * When something cannot be checked (for example, GitHub did not include the
 * diff of a large file), the update is not official.
 *
 * @param {PullRequestInfo} pullRequest
 * @param {ChangedFile[]} files
 * @returns {Classification}
 */
function classifyUpdate(pullRequest, files) {
  /** @type {string[]} */
  const reasons = [];

  const user = pullRequest.user;
  if (!user || user.login !== OFFICIAL_AUTHOR || user.type !== 'Bot') {
    reasons.push(
      `author is not ${OFFICIAL_AUTHOR}: ${user ? user.login : 'unknown'}`,
    );
  }

  const headRepo = pullRequest.head.repo
    ? pullRequest.head.repo.full_name
    : null;
  if (headRepo !== pullRequest.base.repo.full_name) {
    reasons.push(
      `branch is not in this repository: ${headRepo ?? 'deleted repository'}`,
    );
  }

  if (files.length === 0) reasons.push('no changed files');

  for (const file of files) {
    if (!ALLOWED_FILES.includes(file.filename)) {
      reasons.push(
        `file other than package.json or a lockfile changed: ${file.filename}`,
      );
      continue;
    }
    if (file.status !== 'modified') {
      reasons.push(`${file.filename} was ${file.status}, not modified`);
      continue;
    }
    if (typeof file.patch !== 'string' || file.patch === '') {
      reasons.push(`the diff of ${file.filename} is not available`);
      continue;
    }
    const changed =
      file.filename === 'package.json'
        ? packageJsonChanges(file.patch)
        : lockfileChanges(file.filename, file.patch);
    for (const change of changed) {
      if (change.name === null) {
        reasons.push(
          `${file.filename}: change outside a package entry: ${change.line}`,
        );
      } else if (!change.name.startsWith(OFFICIAL_SCOPE)) {
        reasons.push(
          file.filename === 'package.json'
            ? `package.json: entry other than an ${OFFICIAL_SCOPE}* dependency changed: ${change.name}`
            : `${file.filename}: package other than ${OFFICIAL_SCOPE}* changed: ${change.name}`,
        );
      } else if (change.invalidSpec) {
        reasons.push(
          `${file.filename}: ${change.name} is not set to a version number: ${change.line}`,
        );
      }
    }
  }

  return { official: reasons.length === 0, reasons: [...new Set(reasons)] };
}

/**
 * @typedef {object} LineChange
 * @property {string | null} name The package the line belongs to, or null when unknown.
 * @property {string} line The changed line without the leading `+` or `-`.
 * @property {boolean} [invalidSpec] True when a dependency is not set to a version number.
 */

/**
 * @typedef {object} PatchLine
 * @property {' ' | '+' | '-'} kind
 * @property {string} text
 */

/**
 * Splits a unified diff into hunks of lines.
 *
 * @param {string} patch
 * @returns {PatchLine[][]}
 */
function parseHunks(patch) {
  /** @type {PatchLine[][]} */
  const hunks = [];
  /** @type {PatchLine[] | null} */
  let current = null;
  for (const raw of patch.split('\n')) {
    if (raw.startsWith('@@')) {
      current = [];
      hunks.push(current);
      continue;
    }
    if (current === null || raw.startsWith('\\')) continue;
    const kind = raw[0];
    if (kind === '+' || kind === '-' || kind === ' ') {
      current.push({ kind, text: raw.slice(1) });
    } else if (raw === '') {
      current.push({ kind: ' ', text: '' });
    }
  }
  return hunks;
}

/** @param {string} text */
function isPunctuationOnly(text) {
  return /^[\s{}[\],]*$/.test(text);
}

/**
 * Changed lines of a `package.json` diff. A line counts as an official change
 * only when it is a `"@goodnight-web/<name>": "<version>"` entry.
 *
 * @param {string} patch
 * @returns {LineChange[]}
 */
function packageJsonChanges(patch) {
  /** @type {LineChange[]} */
  const changes = [];
  for (const hunk of parseHunks(patch)) {
    for (const { kind, text } of hunk) {
      if (kind === ' ' || isPunctuationOnly(text)) continue;
      const line = text.trim();
      const entry = /^"([^"]+)"\s*:\s*(.*?),?$/.exec(line);
      if (!entry) {
        changes.push({ name: null, line });
        continue;
      }
      const name = /** @type {string} */ (entry[1]);
      const value = /^"([^"]*)"$/.exec(/** @type {string} */ (entry[2]));
      changes.push({
        name,
        line,
        invalidSpec:
          !value || !VERSION_SPEC.test(/** @type {string} */ (value[1])),
      });
    }
  }
  return changes;
}

/**
 * The package name at the end of a dependency path, such as
 * `node_modules/a/node_modules/@scope/b` or `@scope/a/b` (bun.lock).
 *
 * @param {string} path
 * @returns {string}
 */
function lastPackageName(path) {
  const segments = path
    .split('/')
    .filter((s) => s !== '' && s !== 'node_modules');
  const last = segments[segments.length - 1] ?? '';
  const parent = segments[segments.length - 2];
  return parent && parent.startsWith('@') ? `${parent}/${last}` : last;
}

/**
 * Removes the version (and pnpm peer suffix) from `name@1.2.3(peer@4)`.
 *
 * @param {string} key
 * @returns {string}
 */
function stripVersion(key) {
  const withoutPeers = key.split('(')[0] ?? key;
  const at = withoutPeers.indexOf('@', 1);
  return at === -1 ? withoutPeers : withoutPeers.slice(0, at);
}

/**
 * The package a lockfile line names by itself, `null` for a line that only
 * describes the entry above it (such as `"version": ...`), or `undefined` for
 * a line that is neither.
 *
 * @param {string} filename
 * @param {string} text
 * @returns {string | null | undefined}
 */
function nameInLockfileLine(filename, text) {
  const line = text.trim();
  if (filename === 'pnpm-lock.yaml') {
    const entry = /^(?:'([^']+)'|"([^"]+)"|([^\s'":][^:]*?)):(?:\s|$)/.exec(
      line,
    );
    if (!entry) return undefined;
    const key = entry[1] ?? entry[2] ?? entry[3] ?? '';
    if (LOCKFILE_METADATA_KEYS.has(key)) return null;
    return stripVersion(key);
  }

  const entry = /^"([^"]*)"\s*:\s*(.*)$/.exec(line);
  if (!entry) return undefined;
  const key = /** @type {string} */ (entry[1]);
  const value = /** @type {string} */ (entry[2]);
  if (filename === 'bun.lock') {
    // Package entries look like "key": ["name@version", ...]. The key can be
    // a path such as "parent/child", so the name comes from the value.
    const resolved = /^\[\s*"([^"]+)"/.exec(value);
    if (resolved) return stripVersion(/** @type {string} */ (resolved[1]));
    return lastPackageName(key);
  }
  // package-lock.json
  if (key.startsWith('node_modules/')) return lastPackageName(key);
  if (LOCKFILE_METADATA_KEYS.has(key)) return null;
  return key;
}

/**
 * Whether a lockfile line starts a package entry, and the package name.
 * Used to find which package a `"version"` or `integrity` line belongs to.
 *
 * @param {string} filename
 * @param {string} text
 * @param {number} maxIndent Only lines indented less than this count.
 * @returns {string | null}
 */
function entryOwner(filename, text, maxIndent) {
  const indent = text.length - text.trimStart().length;
  if (indent >= maxIndent) return null;
  if (filename === 'pnpm-lock.yaml') {
    if (!/:\s*$/.test(text)) return null;
    const name = nameInLockfileLine(filename, text);
    return typeof name === 'string' ? name : null;
  }
  const key = /^\s*"(node_modules\/[^"]+)"\s*:\s*\{/.exec(text);
  return key ? lastPackageName(/** @type {string} */ (key[1])) : null;
}

/**
 * Changed lines of a lockfile diff, each with the package it belongs to.
 *
 * @param {string} filename
 * @param {string} patch
 * @returns {LineChange[]}
 */
function lockfileChanges(filename, patch) {
  /** @type {LineChange[]} */
  const changes = [];
  for (const hunk of parseHunks(patch)) {
    hunk.forEach(({ kind, text }, index) => {
      if (kind === ' ' || isPunctuationOnly(text)) return;
      const line = text.trim();
      const name = nameInLockfileLine(filename, text);
      if (typeof name === 'string') {
        changes.push({ name, line });
        return;
      }
      // Find the entry this line is part of, looking up through unchanged
      // lines and lines on the same side of the diff.
      const indent = text.length - text.trimStart().length;
      let owner = null;
      for (let i = index - 1; i >= 0 && owner === null; i -= 1) {
        const previous = /** @type {PatchLine} */ (hunk[i]);
        if (previous.kind !== ' ' && previous.kind !== kind) continue;
        owner = entryOwner(filename, previous.text, indent);
      }
      changes.push({ name: owner, line });
    });
  }
  return changes;
}

/**
 * The comment text for a classification, in Japanese and English.
 *
 * @param {Classification} result
 * @param {string} headSha The commit that was checked.
 * @returns {string}
 */
function buildComment(result, headSha) {
  const commit = headSha.slice(0, 7);
  if (result.official) {
    return [
      MARKER,
      '### ✅ goodnight-web の公式アップデートです',
      '',
      'プレビューを確認してからマージしてください。',
      '',
      '### ✅ Official goodnight-web update',
      '',
      'Safe to merge after checking the preview.',
      '',
      `<sub>確認したコミット / Checked commit: ${commit}</sub>`,
    ].join('\n');
  }
  return [
    MARKER,
    '### ⚠️ 公式のアップデートではありません',
    '',
    '変更内容がわからない場合は、マージしないでください。',
    '',
    '### ⚠️ This is not an official update',
    '',
    "If you don't understand the changes, don't merge.",
    '',
    '<details><summary>理由 / Reasons</summary>',
    '',
    ...result.reasons.map((reason) => `- ${reason.replaceAll('`', "'")}`),
    '',
    '</details>',
    '',
    `<sub>確認したコミット / Checked commit: ${commit}</sub>`,
  ].join('\n');
}

/**
 * @typedef {object} Toolkit
 * The objects that actions/github-script passes to the script. Only the
 * members this script uses are listed.
 * @property {{
 *   paginate: (method: unknown, params: Record<string, unknown>) => Promise<unknown[]>,
 *   rest: {
 *     pulls: { listFiles: unknown },
 *     issues: {
 *       listComments: unknown,
 *       createComment: (params: Record<string, unknown>) => Promise<unknown>,
 *       updateComment: (params: Record<string, unknown>) => Promise<unknown>,
 *     },
 *   },
 * }} github
 * @property {{ payload: { pull_request?: unknown }, repo: { owner: string, repo: string } }} context
 * @property {{ info: (message: string) => void }} core
 */

/**
 * Entry point for actions/github-script: classifies the pull request of the
 * event and creates or updates the single marker comment.
 *
 * @param {Toolkit} toolkit
 * @returns {Promise<Classification>}
 * @throws {Error} When the event has no pull request.
 */
async function run({ github, context, core }) {
  if (!context.payload.pull_request)
    throw new Error('This script needs a pull_request_target event.');
  const pullRequest = /** @type {PullRequestInfo} */ (
    context.payload.pull_request
  );
  const { owner, repo } = context.repo;
  const issueNumber = pullRequest.number;

  const files = /** @type {ChangedFile[]} */ (
    await github.paginate(github.rest.pulls.listFiles, {
      owner,
      repo,
      pull_number: issueNumber,
      per_page: 100,
    })
  );
  const result = classifyUpdate(pullRequest, files);
  const body = buildComment(result, pullRequest.head.sha);

  const comments =
    /** @type {{ id: number, body?: string, user: { login: string } | null }[]} */ (
      await github.paginate(github.rest.issues.listComments, {
        owner,
        repo,
        issue_number: issueNumber,
        per_page: 100,
      })
    );
  const existing = comments.find(
    (comment) =>
      comment.user !== null &&
      comment.user.login === COMMENT_AUTHOR &&
      typeof comment.body === 'string' &&
      comment.body.startsWith(MARKER),
  );

  if (!existing) {
    await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body,
    });
  } else if (existing.body !== body) {
    await github.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body,
    });
  }

  core.info(
    result.official
      ? 'Official goodnight-web update.'
      : `Not an official update:\n${result.reasons.join('\n')}`,
  );
  return result;
}

module.exports = { MARKER, classifyUpdate, buildComment, run };
