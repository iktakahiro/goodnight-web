/** Statuses a submission can have, in the order the admin UI lists them. */
export const SUBMISSION_STATUSES = ['unread', 'read'] as const;

/**
 * Status of a submission: `unread` until an admin opens it, then `read`. An
 * admin can set it back to `unread`. Suspected spam is a separate flag
 * (`suspectedSpam`), not a status.
 */
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/** Narrows an unknown value to {@link SubmissionStatus}. */
export const isSubmissionStatus = (value: unknown): value is SubmissionStatus =>
  typeof value === 'string' &&
  (SUBMISSION_STATUSES as readonly string[]).includes(value);
