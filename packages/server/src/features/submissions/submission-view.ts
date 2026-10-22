/**
 * Views of the admin list, in the order the admin UI shows them. `unread`,
 * `read`, and `all` leave suspected spam out; `spam` shows only suspected
 * spam, read or unread.
 */
export const SUBMISSION_VIEWS = ['unread', 'read', 'all', 'spam'] as const;

/** A view of the admin list. See {@link SUBMISSION_VIEWS}. */
export type SubmissionView = (typeof SUBMISSION_VIEWS)[number];

/** The view of the admin list when none is given. */
export const DEFAULT_SUBMISSION_VIEW = 'all' satisfies SubmissionView;

/** Longest accepted email search term, in characters (the email limit). */
export const EMAIL_SEARCH_MAX_LENGTH = 254;

/** Order of the admin list by received time. Newest first by default. */
export type SubmissionOrder = 'asc' | 'desc';
