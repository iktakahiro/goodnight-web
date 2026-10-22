import * as z from 'zod';
import { SUBMISSION_STATUSES } from '../submissions/submission-status.ts';

/** Submissions per page in the admin list when `limit` is not given. */
export const ADMIN_PAGE_SIZE = 50;

/** Largest accepted `limit` for the admin list. */
export const ADMIN_MAX_PAGE_SIZE = 100;

/** Largest accepted `page` for the admin list. */
export const ADMIN_MAX_PAGE = 100_000;

/**
 * A positive decimal integer from 1 to `max`, written with digits only: no
 * sign, exponent, fraction, spaces, or leading zeros.
 */
const boundedInteger = (max: number) =>
  z
    .string()
    .max(String(max).length)
    .regex(/^[1-9][0-9]*$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(max));

/** `?status=`: a submission status; empty or `all` means every status. */
const statusParam = z
  .enum(['', 'all', ...SUBMISSION_STATUSES])
  .optional()
  .transform((value) => (value === '' || value === 'all' ? undefined : value));

/** Query of `GET /api/admin/submissions.csv`. */
export const exportQuerySchema = z.object({ status: statusParam });

/**
 * Query of `GET /api/admin/submissions`: `status`, `page` (1 to
 * {@link ADMIN_MAX_PAGE}, default 1), and `limit` (1 to
 * {@link ADMIN_MAX_PAGE_SIZE}, default {@link ADMIN_PAGE_SIZE}).
 */
export const listQuerySchema = z.object({
  status: statusParam,
  page: boundedInteger(ADMIN_MAX_PAGE).default(1),
  limit: boundedInteger(ADMIN_MAX_PAGE_SIZE).default(ADMIN_PAGE_SIZE),
});
