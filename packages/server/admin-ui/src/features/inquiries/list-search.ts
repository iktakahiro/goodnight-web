import * as z from 'zod';
import {
  FIELD_ID_PATTERN,
  OPTION_VALUE_PATTERN,
} from '../../../../src/features/contact-form/form-definition.ts';
import {
  DEFAULT_SUBMISSION_VIEW,
  EMAIL_SEARCH_MAX_LENGTH,
  SUBMISSION_VIEWS,
  type SubmissionView,
} from '../../../../src/features/submissions/submission-view.ts';
import type { ListQuery } from './inquiries-api.ts';

/** The views of the segmented control, in order. `all` is the default. */
export const LIST_VIEWS: readonly SubmissionView[] = SUBMISSION_VIEWS;

/** Highest page the admin API accepts. */
const MAX_PAGE = 100_000;

/** Highest form version the admin API accepts as a filter. */
const MAX_VERSION = 1_000_000;

const optional = <T extends z.ZodType>(schema: T) =>
  schema.optional().catch(undefined);

/**
 * Search parameters of the list (`/admin?view=unread&q=example&page=2`).
 * Defaults are left out of the URL, and a value that is not valid (an old
 * bookmark, a typo) falls back to the default instead of showing an error.
 *
 * - `view`: `unread`, `read`, or `spam`; without it, `all`.
 * - `q`: part of an email address (at most 254 characters, trimmed).
 * - `page`: a page of 50 (`ADMIN_PAGE_SIZE`), from 2.
 * - `dir`: `asc` for oldest first; without it, newest first. The list is
 *   sorted by received time only.
 * - `version`: one form version.
 * - `field` and `value`: a select or radio field id and one of its option
 *   values. The server checks them against the current form.
 */
export const listSearchSchema = z.object({
  view: optional(z.enum(SUBMISSION_VIEWS).exclude([DEFAULT_SUBMISSION_VIEW])),
  q: optional(
    z
      .string()
      .max(EMAIL_SEARCH_MAX_LENGTH)
      .transform((value) => value.trim() || undefined),
  ),
  page: optional(z.coerce.number().int().min(2).max(MAX_PAGE)),
  dir: optional(z.literal('asc')),
  version: optional(z.coerce.number().int().min(1).max(MAX_VERSION)),
  field: optional(z.string().regex(FIELD_ID_PATTERN)),
  value: optional(z.string().regex(OPTION_VALUE_PATTERN)),
});

/** Validated list search parameters. */
export type ListSearch = z.output<typeof listSearchSchema>;

/** Turns search parameters into a full list query with defaults. */
export const listQuery = (search: ListSearch): ListQuery => ({
  view: search.view ?? DEFAULT_SUBMISSION_VIEW,
  page: search.page ?? 1,
  dir: search.dir ?? 'desc',
  q: search.q,
  version: search.version,
  // A field filter needs both parts.
  ...(search.field && search.value
    ? { field: search.field, value: search.value }
    : {}),
});

/** Builds the search parameters for a list query, without defaults. */
export const listSearch = (query: Partial<ListQuery> = {}): ListSearch => ({
  view:
    query.view === undefined || query.view === DEFAULT_SUBMISSION_VIEW
      ? undefined
      : query.view,
  q: query.q?.trim() || undefined,
  page: query.page && query.page > 1 ? query.page : undefined,
  dir: query.dir === 'asc' ? 'asc' : undefined,
  version: query.version,
  field: query.field && query.value ? query.field : undefined,
  value: query.field && query.value ? query.value : undefined,
});
