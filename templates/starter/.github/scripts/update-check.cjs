// @ts-check
// Classifies a pull request as an official goodnight-web update or not, and
// posts one comment with the result. Used by .github/workflows/update-check.yml.
//
// This file runs from the base branch. It only reads pull request metadata,
// the commit list, and the changed-file list through the GitHub API, and sets
// one commit status on the pull request's head commit. It never runs code
// from the pull request. Do not edit it unless you know what you are doing.
'use strict';

/** Hidden marker that identifies the comment this script owns. */
const MARKER = '<!-- goodnight-web:update-check -->';

/** The only author an official update can come from. */
const OFFICIAL_AUTHOR = 'dependabot[bot]';

/** The login of the account that posts the comment with `GITHUB_TOKEN`. */
const COMMENT_AUTHOR = 'github-actions[bot]';

/** Package scope of official goodnight-web packages. */
const OFFICIAL_SCOPE = '@goodnight-web/';

/** The commit status context this script sets on the head commit. */
const STATUS_CONTEXT = 'goodnight-web/update-check';

/** Lockfiles an official update may change. See {@link classifyUpdate}. */
const LOCKFILES = ['package-lock.json', 'bun.lock', 'pnpm-lock.yaml'];

/** The only registry a lockfile entry of an official update may come from. */
const NPM_REGISTRY = 'https://registry.npmjs.org/';

/**
 * The most commits the "List commits on a pull request" API returns. A list
 * of this length may be cut short.
 */
const MAX_LISTED_COMMITS = 250;

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
 * @property {number} [commits] The number of commits GitHub reports for the pull request.
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
 * @typedef {object} PullRequestCommit
 * One entry of the "List commits on a pull request" API response. `author`
 * and `committer` are the GitHub accounts linked to the commit, or null.
 * @property {string} [sha]
 * @property {{ login: string } | null} author
 * @property {{ login: string } | null} committer
 * @property {{ verification?: { verified?: boolean } }} [commit] The Git data;
 *   `verification.verified` is GitHub's check of the commit signature.
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
 * - every commit's GitHub author and committer are `dependabot[bot]` (a
 *   commit pushed by anyone else, a commit with no linked account, or a
 *   commit made in the GitHub web interface, whose committer is
 *   `web-flow`, is not);
 * - the only changed files are `package.json` and lockfiles at the root, and
 *   they were modified (not added, removed, or renamed);
 * - `package.json` is one of them, and every changed line in it is an
 *   `@goodnight-web/*` dependency set to a version number;
 * - every changed line of `package-lock.json` looks like lockfile content,
 *   every added `"resolved"` URL is on {@link NPM_REGISTRY}, every added
 *   `"integrity"` is `sha512-...`, and no added line is a `"link": true`
 *   entry or holds a `git+`, `git:`, `github:`, `file:`, `link:`, `http:`,
 *   or other-host URL. Other lockfiles get the same URL checks on their
 *   added lines.
 *
 * Other lockfile changes are allowed: a new `@goodnight-web/server` version
 * can bring new versions of its own dependencies (for example `hono`), and
 * those show up only in the lockfile. The lockfile is not re-resolved.
 * Which top-level packages the site uses is decided by `package.json`, and
 * that diff is checked line by line.
 *
 * When the check may have missed a change, the update is not official: when
 * the file list may be incomplete (it does not match `changed_files`, or it
 * has {@link MAX_LISTED_FILES} entries), when the commit list may be
 * incomplete (it does not match `commits`, or it has
 * {@link MAX_LISTED_COMMITS} entries), or when the `package.json` or
 * `package-lock.json` diff is missing, malformed, cut short within a hunk,
 * or does not add up to the file's `additions` and `deletions` (for
 * example, a hunk was left out).
 *
 * Text from the pull request (file names, lines, logins) is cleaned with
 * {@link clean} before it goes into a reason.
 *
 * @param {PullRequestInfo} pullRequest
 * @param {ChangedFile[]} files
 * @param {PullRequestCommit[]} commits
 * @returns {Classification}
 */
function classifyUpdate(pullRequest, files, commits) {
  /** @type {string[]} */
  const reasons = [];

  const user = pullRequest.user;
  if (!user || user.login !== OFFICIAL_AUTHOR || user.type !== 'Bot') {
    reasons.push(
      `author is not ${OFFICIAL_AUTHOR}: ${user ? clean(user.login) : 'unknown'}`,
    );
  }

  const headRepo = pullRequest.head.repo
    ? pullRequest.head.repo.full_name
    : null;
  if (headRepo !== pullRequest.base.repo.full_name) {
    reasons.push(
      `branch is not in this repository: ${headRepo === null ? 'deleted repository' : clean(headRepo)}`,
    );
  }

  if (
    commits.length === 0 ||
    commits.length >= MAX_LISTED_COMMITS ||
    (typeof pullRequest.commits === 'number' &&
      commits.length !== pullRequest.commits)
  ) {
    reasons.push(
      `the list of commits may be incomplete: listed ${commits.length}, expected ${pullRequest.commits ?? 'unknown'}`,
    );
  }
  // The commits are listed oldest first, so the last one is the head of the
  // pull request when this script read it. If the branch moved after the
  // event was sent, the status below would vouch for a commit that was not
  // checked, so the lists and the event must agree.
  const lastCommit = commits[commits.length - 1];
  if (lastCommit && lastCommit.sha !== pullRequest.head.sha) {
    reasons.push(
      `the branch changed while it was checked: the last commit is ${clean(String(lastCommit.sha ?? '')).slice(0, 7) || 'unknown'}, the event is for ${clean(String(pullRequest.head.sha)).slice(0, 7)}`,
    );
  }
  for (const commit of commits) {
    const short = clean(String(commit.sha ?? '')).slice(0, 7) || 'unknown';
    // The author and committer are only names in the commit, so anyone who
    // can push a branch could write the Dependabot address. GitHub signs
    // Dependabot's commits; require its verification as well.
    if (commit.commit?.verification?.verified !== true) {
      reasons.push(`commit ${short}: the signature is not verified by GitHub`);
    }
    for (const role of /** @type {const} */ (['author', 'committer'])) {
      const account = commit[role];
      if (!account || account.login !== OFFICIAL_AUTHOR) {
        reasons.push(
          `commit ${short}: ${role} is not ${OFFICIAL_AUTHOR}: ${account ? clean(account.login) : 'no GitHub account'}`,
        );
      }
    }
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
        `file other than package.json or a lockfile changed: ${clean(file.filename)}`,
      );
      continue;
    }
    if (file.status !== 'modified') {
      reasons.push(`${file.filename} was ${clean(file.status)}, not modified`);
      continue;
    }
    if (file.filename !== 'package.json') {
      reasons.push(...lockfileProblems(file));
      continue;
    }
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
          `package.json: change outside a dependency entry: ${clean(change.line)}`,
        );
      } else if (!change.name.startsWith(OFFICIAL_SCOPE)) {
        reasons.push(
          `package.json: entry other than an ${OFFICIAL_SCOPE}* dependency changed: ${clean(change.name)}`,
        );
      } else if (change.invalidSpec) {
        reasons.push(
          `package.json: ${clean(change.name)} is not set to a version number: ${clean(change.line)}`,
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

// Control characters, line and paragraph separators, and bidi and zero-width
// format characters. They could start a new Markdown line in the comment, a
// workflow command in the log, or make a reason read differently.
// oxlint-disable-next-line no-control-regex
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\p{Cf}]/gu;

/** The longest piece of pull request text a reason quotes. */
const MAX_QUOTED_LENGTH = 200;

/**
 * Makes text from the pull request safe to quote in a reason: control and
 * format characters (including CR and LF) become `?`, and long text is cut.
 *
 * @param {string} text
 * @returns {string}
 */
function clean(text) {
  const safe = String(text).replace(UNSAFE_TEXT, '?');
  return safe.length > MAX_QUOTED_LENGTH
    ? `${safe.slice(0, MAX_QUOTED_LENGTH)}...`
    : safe;
}

// URLs and specifiers that only an official npm registry entry may avoid.
const FOREIGN_SOURCE =
  /git\+|git:|github:|gitlab:|bitbucket:|file:|link:|http:\/\/|"link"\s*:\s*true/i;
const ANY_URL = /[a-z][a-z0-9+.-]*:\/\/[^\s"']+/gi;
const FUNDING_KEYS = ['funding', 'url', 'type'];

// One line of a pretty-printed JSON lockfile: a key and a value, a string
// array element, or only punctuation.
const LOCKFILE_LINE =
  /^\s*(?:"[^"\\]*(?:\\.[^"\\]*)*"\s*:\s*(?:"[^"\\]*(?:\\.[^"\\]*)*"|true|false|null|-?\d+(?:\.\d+)?|\{\s*\}?|\[\s*\]?)|"[^"\\]*(?:\\.[^"\\]*)*"|[{}[\]])?\s*,?\s*$/;

/**
 * Problems in the diff of a lockfile. The diff of `package-lock.json` must be
 * complete, and each changed line must look like lockfile content. In every
 * lockfile, an added line must not point anywhere but {@link NPM_REGISTRY}.
 *
 * @param {ChangedFile} file
 * @returns {string[]}
 */
function lockfileProblems(file) {
  const strict = file.filename === 'package-lock.json';
  if (typeof file.patch !== 'string' || file.patch === '') {
    return strict ? [`the diff of ${file.filename} is not available`] : [];
  }
  const hunks = parseHunks(file.patch);
  if (hunks === null || (strict && !matchesTotals(hunks, file))) {
    return [`the diff of ${file.filename} is incomplete`];
  }
  /** @type {string[]} */
  const problems = [];
  for (const { kind, text } of hunks.flat()) {
    if (kind === ' ') continue;
    const line = text.trim();
    if (strict && !LOCKFILE_LINE.test(text)) {
      problems.push(`${file.filename}: unexpected line: ${clean(line)}`);
      continue;
    }
    if (kind !== '+') continue;
    // JSON escapes (`\u0072esolved`, `https:\/\/`) would hide a key or a URL
    // from the checks below. npm writes none of them in these lines.
    if (strict && line.includes('\\')) {
      problems.push(
        `${file.filename}: escape sequence in a changed line: ${clean(line)}`,
      );
      continue;
    }
    const entry = /^"([^"]*)"\s*:\s*(.*?),?$/.exec(line);
    const key = entry ? entry[1] : null;
    // Funding links point to other hosts by design, and a bare string is an
    // array element (`os`, `cpu`, `funding`); neither says where a package
    // is installed from.
    if (strict && (key === null || FUNDING_KEYS.includes(String(key)))) {
      continue;
    }
    if (FOREIGN_SOURCE.test(line)) {
      problems.push(
        `${file.filename}: entry not from the npm registry: ${clean(line)}`,
      );
      continue;
    }
    for (const url of line.match(ANY_URL) ?? []) {
      if (!url.startsWith(NPM_REGISTRY)) {
        problems.push(
          `${file.filename}: URL outside ${NPM_REGISTRY}: ${clean(url)}`,
        );
      }
    }
    if (!strict || !entry) continue;
    const quoted = /^"([^"]*)"$/.exec(String(entry[2]));
    const value = quoted ? String(quoted[1]) : String(entry[2]);
    if (key === 'resolved' && !value.startsWith(NPM_REGISTRY)) {
      problems.push(
        `${file.filename}: resolved outside ${NPM_REGISTRY}: ${clean(value)}`,
      );
    }
    if (key === 'integrity' && !/^sha512-[A-Za-z0-9+/]+=*$/.test(value)) {
      problems.push(
        `${file.filename}: integrity is not sha512: ${clean(value)}`,
      );
    }
  }
  return problems;
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
      'マージして問題ありません。ビルドの結果が表示されていれば、確認してからマージしてください。',
      '',
      '### ✅ Official goodnight-web update',
      '',
      'Safe to merge. If a build result is shown, check it first.',
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
    ...result.reasons.map(
      (reason) => `- \`${clean(reason).replaceAll('`', "'")}\``,
    ),
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
 *     pulls: { listFiles: unknown, listCommits: unknown },
 *     repos: {
 *       createCommitStatus: (params: Record<string, unknown>) => Promise<unknown>,
 *     },
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
 * event, creates or updates the single marker comment, and sets the commit
 * status {@link STATUS_CONTEXT} on the head commit: `success` only for an
 * official update, `failure` otherwise, and `error` when the pull request
 * could not be read. A comment can be copied into a pull request body; the
 * status is bound to the commit, and setting it takes write access to the repository.
 *
 * When the changed files or the commits cannot be listed, the comment is set
 * to the warning so that an earlier "official" comment does not stay, the
 * status is set to `error`, and the error is thrown again.
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
    const commits = /** @type {PullRequestCommit[]} */ (
      await github.paginate(github.rest.pulls.listCommits, {
        owner,
        repo,
        pull_number: issueNumber,
        per_page: 100,
      })
    );
    result = classifyUpdate(pullRequest, files, commits);
  } catch (error) {
    listError = error;
    result = {
      official: false,
      reasons: ['the list of changed files or commits could not be read'],
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

  await github.rest.repos.createCommitStatus({
    owner,
    repo,
    sha: pullRequest.head.sha,
    context: STATUS_CONTEXT,
    state: result.official ? 'success' : listError ? 'error' : 'failure',
    description: result.official
      ? 'Official goodnight-web update'
      : 'Not an official goodnight-web update. See the comment.',
  });

  if (listError !== null) throw listError;
  core.info(
    result.official
      ? 'Official goodnight-web update.'
      : `Not an official update:\n${result.reasons.join('\n')}`,
  );
  return result;
}

module.exports = {
  MARKER,
  STATUS_CONTEXT,
  classifyUpdate,
  buildComment,
  clean,
  run,
};
