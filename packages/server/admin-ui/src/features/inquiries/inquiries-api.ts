import type {
  AdminSubmission,
  AdminSubmissionList,
} from '../../../../src/features/admin-api/admin-routes.ts';
import type { Locale } from '../../../../src/shared/messages.ts';
import type { SubmissionSortColumn } from '../../../../src/features/submissions/submission-sort.ts';
import type { SubmissionStatus } from '../../../../src/features/submissions/submission-status.ts';
import { apiFetch } from '../../shared/api/api-client.ts';

/** A status filter in the list: one status or every inquiry. */
export type StatusFilter = SubmissionStatus | 'all';

/** Filters, order, and page of the list. */
export interface ListQuery {
  status: StatusFilter;
  page: number;
  sort: SubmissionSortColumn;
  dir: 'asc' | 'desc';
  version?: number | undefined;
  /** A select or radio field id; set together with `value`. */
  field?: string | undefined;
  value?: string | undefined;
}

const filterParams = (query: Partial<ListQuery>): URLSearchParams => {
  const params = new URLSearchParams();
  if (query.status && query.status !== 'all') {
    params.set('status', query.status);
  }
  if (query.version) params.set('version', String(query.version));
  if (query.field && query.value) {
    params.set('field', query.field);
    params.set('value', query.value);
  }
  return params;
};

const withQuery = (path: string, params: URLSearchParams) => {
  const query = params.toString();
  return query ? `${path}?${query}` : path;
};

/** `GET /api/admin/submissions`: one page (50) of inquiries. */
export const fetchInquiries = (
  query: ListQuery,
): Promise<AdminSubmissionList> => {
  const params = filterParams(query);
  if (query.sort !== 'received_at') params.set('sort', query.sort);
  if (query.dir !== 'desc') params.set('dir', query.dir);
  if (query.page > 1) params.set('page', String(query.page));
  return apiFetch<AdminSubmissionList>(
    withQuery('/api/admin/submissions', params),
  );
};

/** `GET /api/admin/submissions/:id`. The server marks a new inquiry read. */
export const fetchInquiry = (id: string): Promise<AdminSubmission> =>
  apiFetch<AdminSubmission>(`/api/admin/submissions/${encodeURIComponent(id)}`);

/** `PATCH /api/admin/submissions/:id` with a new status. */
export const updateInquiryStatus = (
  id: string,
  status: SubmissionStatus,
): Promise<AdminSubmission> =>
  apiFetch<AdminSubmission>(
    `/api/admin/submissions/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify({ status }) },
  );

/** `DELETE /api/admin/submissions/:id`. */
export const deleteInquiry = (id: string): Promise<{ ok: true }> =>
  apiFetch<{ ok: true }>(`/api/admin/submissions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

/**
 * URL of the CSV export for the list's filters, with headers and option
 * labels in `lang`. The browser downloads it.
 */
export const csvExportUrl = (
  query: Partial<ListQuery>,
  lang: Locale,
): string => {
  const params = filterParams(query);
  params.set('lang', lang);
  return withQuery('/api/admin/submissions.csv', params);
};
