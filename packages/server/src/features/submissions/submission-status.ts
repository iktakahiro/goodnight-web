/** Statuses a submission can have, in the order the admin UI lists them. */
export const SUBMISSION_STATUSES = [
  'new',
  'read',
  'done',
  'held',
  'spam',
] as const;

/**
 * Status of a submission: `new` (unread), `read`, `done`, `held` (kept for
 * review, never notified), or `spam`.
 */
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/** Narrows an unknown value to {@link SubmissionStatus}. */
export const isSubmissionStatus = (value: unknown): value is SubmissionStatus =>
  typeof value === 'string' &&
  (SUBMISSION_STATUSES as readonly string[]).includes(value);
