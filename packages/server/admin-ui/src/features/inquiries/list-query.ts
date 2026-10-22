import { isSubmissionStatus } from '../../../../src/features/submissions/submission-status.ts';
import type { StatusFilter } from './inquiries-api.ts';

/** The status tabs, in order. `all` is the default. */
export const STATUS_FILTERS: readonly StatusFilter[] = [
  'all',
  'new',
  'read',
  'done',
  'held',
  'spam',
];

/** Reads `?status=` from the list URL. Unknown values mean `all`. */
export const parseStatusFilter = (value: string | null): StatusFilter =>
  isSubmissionStatus(value) ? value : 'all';

/** Reads `?page=` from the list URL. Anything but a positive integer is 1. */
export const parsePage = (value: string | null): number => {
  if (!value || !/^\d{1,6}$/.test(value)) return 1;
  const page = Number(value);
  return page >= 1 ? page : 1;
};

/** Builds the list URL for a filter and page, leaving out the defaults. */
export const listPath = (status: StatusFilter, page = 1): string => {
  const params = new URLSearchParams();
  if (status !== 'all') params.set('status', status);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `/admin?${query}` : '/admin';
};
