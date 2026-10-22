import * as z from 'zod';
import {
  FIELD_ID_PATTERN,
  OPTION_VALUE_PATTERN,
} from '../../../../src/features/contact-form/form-definition.ts';
import { SUBMISSION_SORT_COLUMNS } from '../../../../src/features/submissions/submission-sort.ts';
import { SUBMISSION_STATUSES } from '../../../../src/features/submissions/submission-status.ts';
import type { ListQuery, StatusFilter } from './inquiries-api.ts';

/** The status tabs, in order. `all` is the default. */
export const STATUS_FILTERS: readonly StatusFilter[] = [
  'all',
  ...SUBMISSION_STATUSES,
];

/** Highest page the admin API accepts. */
const MAX_PAGE = 100_000;

/** Highest form version the admin API accepts as a filter. */
const MAX_VERSION = 1_000_000;

const optional = <T extends z.ZodType>(schema: T) =>
  schema.optional().catch(undefined);

/**
 * Search parameters of the list (`/admin?status=new&page=2&sort=email`).
 * Defaults are left out of the URL, and a value that is not valid (an old
 * bookmark, a typo) falls back to the default instead of showing an error.
 *
 * - `status`: one status; without it, every status.
 * - `page`: a page of 50 (`ADMIN_PAGE_SIZE`), from 2.
 * - `sort` and `dir`: `received_at` (default), `email`, or `status`, in
 *   `asc` or `desc` (default) order. Form fields cannot be sorted on.
 * - `version`: one form version.
 * - `field` and `value`: a select or radio field id and one of its option
 *   values. The server checks them against the current form.
 *
 * There is no keyword search.
 */
export const listSearchSchema = z.object({
  status: optional(z.enum(SUBMISSION_STATUSES)),
  page: optional(z.coerce.number().int().min(2).max(MAX_PAGE)),
  sort: optional(z.enum(SUBMISSION_SORT_COLUMNS).exclude(['received_at'])),
  dir: optional(z.literal('asc')),
  version: optional(z.coerce.number().int().min(1).max(MAX_VERSION)),
  field: optional(z.string().regex(FIELD_ID_PATTERN)),
  value: optional(z.string().regex(OPTION_VALUE_PATTERN)),
});

/** Validated list search parameters. */
export type ListSearch = z.output<typeof listSearchSchema>;

/** Turns search parameters into a full list query with defaults. */
export const listQuery = (search: ListSearch): ListQuery => ({
  status: search.status ?? 'all',
  page: search.page ?? 1,
  sort: search.sort ?? 'received_at',
  dir: search.dir ?? 'desc',
  version: search.version,
  // A field filter needs both parts.
  ...(search.field && search.value
    ? { field: search.field, value: search.value }
    : {}),
});

/** Builds the search parameters for a list query, without defaults. */
export const listSearch = (query: Partial<ListQuery> = {}): ListSearch => ({
  status: query.status === 'all' ? undefined : query.status,
  page: query.page && query.page > 1 ? query.page : undefined,
  sort: query.sort && query.sort !== 'received_at' ? query.sort : undefined,
  dir: query.dir === 'asc' ? 'asc' : undefined,
  version: query.version,
  field: query.field && query.value ? query.field : undefined,
  value: query.field && query.value ? query.value : undefined,
});
