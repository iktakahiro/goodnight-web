import * as z from 'zod';
import {
  FIELD_ID_PATTERN,
  OPTION_VALUE_PATTERN,
} from '../contact-form/form-definition.ts';
import { SUBMISSION_SORT_COLUMNS } from '../submissions/submission-sort.ts';
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

/** Largest accepted `version` filter. */
const ADMIN_MAX_FORM_VERSION = 1_000_000;

/**
 * Filters shared by the list and the CSV export:
 *
 * - `status`: one status; empty or `all` means every status.
 * - `version`: one form version.
 * - `field` and `value`: a select or radio field id of the current form and
 *   one of its option values. Both or neither. The route looks the id up in
 *   the definition; the patterns here only reject malformed input early.
 *
 * There is no keyword search parameter. Unknown parameters are rejected.
 */
const filterShape = {
  status: statusParam,
  version: boundedInteger(ADMIN_MAX_FORM_VERSION).optional(),
  field: z.string().max(40).regex(FIELD_ID_PATTERN).optional(),
  value: z.string().max(64).regex(OPTION_VALUE_PATTERN).optional(),
};

const bothOrNeither = (query: { field?: string; value?: string }) =>
  (query.field === undefined) === (query.value === undefined);

/**
 * Query of `GET /api/admin/submissions.csv`: the filters and `lang` (`ja`
 * or `en`) for the headers and option labels.
 */
export const exportQuerySchema = z
  .strictObject({ ...filterShape, lang: z.enum(['ja', 'en']).optional() })
  .refine(bothOrNeither);

/**
 * Query of `GET /api/admin/submissions`: the filters, `sort`
 * (`received_at`, `email`, or `status`; default `received_at`), `dir` (`asc`
 * or `desc`; default `desc`), `page` (1 to {@link ADMIN_MAX_PAGE}, default
 * 1), and `limit` (1 to {@link ADMIN_MAX_PAGE_SIZE}, default
 * {@link ADMIN_PAGE_SIZE}). Form fields cannot be sorted on.
 */
export const listQuerySchema = z
  .strictObject({
    ...filterShape,
    sort: z.enum(SUBMISSION_SORT_COLUMNS).default('received_at'),
    dir: z.enum(['asc', 'desc']).default('desc'),
    page: boundedInteger(ADMIN_MAX_PAGE).default(1),
    limit: boundedInteger(ADMIN_MAX_PAGE_SIZE).default(ADMIN_PAGE_SIZE),
  })
  .refine(bothOrNeither);
