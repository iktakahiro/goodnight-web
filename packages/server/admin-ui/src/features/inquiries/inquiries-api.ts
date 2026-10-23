import type {
  AdminSubmission,
  AdminSubmissionList,
} from '../../../../src/features/admin-api/admin-routes.ts';
import type { Locale } from '../../../../src/shared/messages.ts';
import type { SubmissionStatus } from '../../../../src/features/submissions/submission-status.ts';
import type {
  SubmissionOrder,
  SubmissionView,
} from '../../../../src/features/submissions/submission-view.ts';
import { apiFetch } from '../../shared/api/api-client.ts';

/** Filters, order, and page of the list. */
export interface ListQuery {
  view: SubmissionView;
  page: number;
  /** Order by received time. */
  dir: SubmissionOrder;
  /** Part of an email address. */
  q?: string | undefined;
  version?: number | undefined;
  /** A select or radio field id; set together with `value`. */
  field?: string | undefined;
  value?: string | undefined;
}

const filterParams = (query: Partial<ListQuery>): URLSearchParams => {
  const params = new URLSearchParams();
  if (query.view && query.view !== 'all') params.set('view', query.view);
  if (query.q) params.set('q', query.q);
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
  if (query.dir !== 'desc') params.set('dir', query.dir);
  if (query.page > 1) params.set('page', String(query.page));
  return apiFetch<AdminSubmissionList>(
    withQuery('/api/admin/submissions', params),
  );
};

/** `GET /api/admin/submissions/:id`. Changes nothing on the server. */
export const fetchInquiry = (id: string): Promise<AdminSubmission> =>
  apiFetch<AdminSubmission>(`/api/admin/submissions/${encodeURIComponent(id)}`);

/**
 * `POST /api/admin/submissions/:id/read`. Marks an unread inquiry read and
 * returns it.
 */
export const markInquiryRead = (id: string): Promise<AdminSubmission> =>
  apiFetch<AdminSubmission>(
    `/api/admin/submissions/${encodeURIComponent(id)}/read`,
    { method: 'POST' },
  );

/** A change to an inquiry: its status, its suspected spam flag, or both. */
export interface InquiryUpdate {
  status?: SubmissionStatus;
  suspectedSpam?: boolean;
}

/** `PATCH /api/admin/submissions/:id`. Returns the updated inquiry. */
export const updateInquiry = (
  id: string,
  update: InquiryUpdate,
): Promise<AdminSubmission> =>
  apiFetch<AdminSubmission>(
    `/api/admin/submissions/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(update) },
  );

/** `DELETE /api/admin/submissions/:id`. */
export const deleteInquiry = (id: string): Promise<{ ok: true }> =>
  apiFetch<{ ok: true }>(`/api/admin/submissions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

/**
 * URL of the CSV export for the list's view, search, and filters, with
 * headers and option labels in `lang`. The browser downloads it.
 */
export const csvExportUrl = (
  query: Partial<ListQuery>,
  lang: Locale,
): string => {
  const params = filterParams(query);
  params.set('lang', lang);
  return withQuery('/api/admin/submissions.csv', params);
};
