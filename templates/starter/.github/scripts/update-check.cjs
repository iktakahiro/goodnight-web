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

/**
 * Lockfiles an official update may change. Their contents are not checked:
 * see {@link classifyUpdate}.
 */
const LOCKFILES = ['package-lock.json', 'bun.lock', 'pnpm-lock.yaml'];

/** Every file an official update may change. Paths are from the repository root. */
const ALLOWED_FILES = ['package.json', ...LOCKFILES];

/**
 * The most files the "List pull request files" API returns. A list of this
 * length may be cut short.
 */
const MAX_LISTED_FILES = 3000;

// An exact or caret/tilde semver version, as Dependabot writes it.
const VERSION_SPEC =
  /^[\^~]?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/**
 * @typedef {object} PullRequestInfo
 * The fields of `github.event.pull_request` this script reads.
 * @property {number} number
 * @property {number} [changed_files] The number of changed files GitHub reports for the pull request.
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
 * @property {number} [additions] The number of added lines in the whole diff.
 * @property {number} [deletions] The number of removed lines in the whole diff.
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
 * - `package.json` is one of them, and every changed line in it is an
 *   `@goodnight-web/*` dependency set to a version number.
 *
 * Lockfile contents are not checked. A new `@goodnight-web/server` version
 * can bring new versions of its own dependencies (for example `hono`), and
 * those show up only in the lockfile. Which top-level packages the site uses
 * is decided by `package.json`, and that diff is checked line by line.
 *
 * When the check may have missed a change, the update is not official: when
 * the file list may be incomplete (it does not match `changed_files`, or it
 * has {@link MAX_LISTED_FILES} entries), or when the `package.json` diff is
 * missing, malformed, cut short within a hunk, or does not add up to the
 * file's `additions` and `deletions` (for example, a hunk was left out).
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

  if (
    typeof pullRequest.changed_files !== 'number' ||
    files.length !== pullRequest.changed_files ||
    files.length >= MAX_LISTED_FILES
  ) {
    reasons.push(
      `the list of changed files may be incomplete: listed ${files.length}, expected ${pullRequest.changed_files ?? 'unknown'}`,
    );
  }

  let officialChanges = 0;
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
    if (file.filename !== 'package.json') continue;
    if (typeof file.patch !== 'string' || file.patch === '') {
      reasons.push('the diff of package.json is not available');
      continue;
    }
    const hunks = parseHunks(file.patch);
    if (hunks === null || !matchesTotals(hunks, file)) {
      reasons.push('the diff of package.json is incomplete');
      continue;
    }
    for (const change of packageJsonChanges(hunks)) {
      if (change.name === null) {
        reasons.push(
          `package.json: change outside a dependency entry: ${change.line}`,
        );
      } else if (!change.name.startsWith(OFFICIAL_SCOPE)) {
        reasons.push(
          `package.json: entry other than an ${OFFICIAL_SCOPE}* dependency changed: ${change.name}`,
        );
      } else if (change.invalidSpec) {
        reasons.push(
          `package.json: ${change.name} is not set to a version number: ${change.line}`,
        );
      } else {
        officialChanges += 1;
      }
    }
  }

  if (officialChanges === 0) {
    reasons.push(`package.json does not change an ${OFFICIAL_SCOPE}* version`);
  }

  return { official: reasons.length === 0, reasons: [...new Set(reasons)] };
}

/**
 * @typedef {object} LineChange
 * @property {string | null} name The key of the changed entry, or null for a line that is not an entry.
 * @property {string} line The changed line without the leading `+` or `-`.
 * @property {boolean} [invalidSpec] True when a dependency is not set to a version number.
 */

/**
 * @typedef {object} PatchLine
 * @property {' ' | '+' | '-'} kind
 * @property {string} text
 */

const HUNK_HEADER = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/;

/**
 * Splits a unified diff into hunks of lines. Each hunk must have exactly the
 * old and new line counts of its `@@` header.
 *
 * @param {string} patch
 * @returns {PatchLine[][] | null} Null when the diff is malformed or a hunk is cut short.
 */
function parseHunks(patch) {
  /** @type {PatchLine[][]} */
  const hunks = [];
  /** @type {PatchLine[] | null} */
  let current = null;
  let oldLeft = 0;
  let newLeft = 0;
  const lines = (patch.endsWith('\n') ? patch.slice(0, -1) : patch).split('\n');
  for (const raw of lines) {
    if (raw.startsWith('\\') && current !== null) continue;
    if (oldLeft === 0 && newLeft === 0) {
      const header = HUNK_HEADER.exec(raw);
      if (!header) return null;
      oldLeft = Number(header[1] ?? '1');
      newLeft = Number(header[2] ?? '1');
      current = [];
      hunks.push(current);
      continue;
    }
    const kind = raw === '' ? ' ' : raw[0];
    if (kind === ' ' && oldLeft > 0 && newLeft > 0) {
      oldLeft -= 1;
      newLeft -= 1;
    } else if (kind === '-' && oldLeft > 0) {
      oldLeft -= 1;
    } else if (kind === '+' && newLeft > 0) {
      newLeft -= 1;
    } else {
      return null;
    }
    /** @type {PatchLine[]} */ (current).push({ kind, text: raw.slice(1) });
  }
  if (hunks.length === 0 || oldLeft !== 0 || newLeft !== 0) return null;
  return hunks;
}

/**
 * True when the hunks add and remove as many lines as GitHub reports for the
 * whole file. A hunk that GitHub left out makes the counts differ.
 *
 * @param {PatchLine[][]} hunks
 * @param {ChangedFile} file
 */
function matchesTotals(hunks, file) {
  let additions = 0;
  let deletions = 0;
  for (const { kind } of hunks.flat()) {
    if (kind === '+') additions += 1;
    if (kind === '-') deletions += 1;
  }
  return additions === file.additions && deletions === file.deletions;
}

/** @param {string} text */
function isPunctuationOnly(text) {
  return /^[\s{}[\],]*$/.test(text);
}

/**
 * Changed lines of a `package.json` diff. A line counts as an official change
 * only when it is a `"@goodnight-web/<name>": "<version>"` entry.
 *
 * @param {PatchLine[][]} hunks
 * @returns {LineChange[]}
 */
function packageJsonChanges(hunks) {
  /** @type {LineChange[]} */
  const changes = [];
  for (const hunk of hunks) {
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
 * When the changed files cannot be listed, the comment is set to the warning
 * so that an earlier "official" comment does not stay, and the error is
 * thrown again.
 *
 * @param {Toolkit} toolkit
 * @returns {Promise<Classification>}
 * @throws {Error} When the event has no pull request, or when an API call fails.
 */
async function run({ github, context, core }) {
  if (!context.payload.pull_request)
    throw new Error('This script needs a pull_request_target event.');
  const pullRequest = /** @type {PullRequestInfo} */ (
    context.payload.pull_request
  );
  const { owner, repo } = context.repo;
  const issueNumber = pullRequest.number;

  /** @type {Classification} */
  let result;
  /** @type {unknown} */
  let listError = null;
  try {
    const files = /** @type {ChangedFile[]} */ (
      await github.paginate(github.rest.pulls.listFiles, {
        owner,
        repo,
        pull_number: issueNumber,
        per_page: 100,
      })
    );
    result = classifyUpdate(pullRequest, files);
  } catch (error) {
    listError = error;
    result = {
      official: false,
      reasons: ['the list of changed files could not be read'],
    };
  }
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

  if (listError !== null) throw listError;
  core.info(
    result.official
      ? 'Official goodnight-web update.'
      : `Not an official update:\n${result.reasons.join('\n')}`,
  );
  return result;
}

module.exports = { MARKER, classifyUpdate, buildComment, run };
