/** Columns the admin list can sort by. Form fields cannot be sorted on. */
export const SUBMISSION_SORT_COLUMNS = [
  'received_at',
  'email',
  'status',
] as const;

/** A column the admin list can sort by. */
export type SubmissionSortColumn = (typeof SUBMISSION_SORT_COLUMNS)[number];

/** Sort order of the admin list. */
export interface SubmissionSort {
  column: SubmissionSortColumn;
  direction: 'asc' | 'desc';
}
