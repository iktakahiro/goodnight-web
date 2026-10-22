import * as z from 'zod';
import { SUBMISSION_STATUSES } from '../../../../src/features/submissions/submission-status.ts';
import type { StatusFilter } from './inquiries-api.ts';

/** The status tabs, in order. `all` is the default. */
export const STATUS_FILTERS: readonly StatusFilter[] = [
  'all',
  ...SUBMISSION_STATUSES,
];

/** Highest page the admin API accepts. */
const MAX_PAGE = 100_000;

/**
 * Search parameters of the list (`/admin?status=new&page=2`). Defaults are
 * left out of the URL, and a value that is not valid (an old bookmark, a
 * typo) falls back to the default instead of showing an error.
 *
 * - `status`: one status; without it, every status.
 * - `page`: a page of 50 (`ADMIN_PAGE_SIZE`), from 1.
 *
 * There is no sort parameter: the admin API lists inquiries by received date,
 * newest first, and has no other order.
 */
export const listSearchSchema = z.object({
  status: z.enum(SUBMISSION_STATUSES).optional().catch(undefined),
  page: z.coerce
    .number()
    .int()
    .min(2)
    .max(MAX_PAGE)
    .optional()
    .catch(undefined),
});

/** Validated list search parameters. */
export type ListSearch = z.output<typeof listSearchSchema>;

/** Builds the search parameters for a filter and page, without defaults. */
export const listSearch = (status: StatusFilter, page = 1): ListSearch => ({
  status: status === 'all' ? undefined : status,
  page: page > 1 ? page : undefined,
});
