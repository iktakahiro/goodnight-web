import type {
  AdminSubmission,
  AdminSubmissionList,
} from '../../../../src/features/admin-api/admin-routes.ts';
import type { SubmissionStatus } from '../../../../src/features/submissions/submission-status.ts';
import { apiFetch } from '../../shared/api/api-client.ts';

/** A status filter in the list: one status or every inquiry. */
export type StatusFilter = SubmissionStatus | 'all';

const statusQuery = (status: StatusFilter) =>
  status === 'all' ? '' : `status=${status}`;

/** `GET /api/admin/submissions`: one page (50) of inquiries, newest first. */
export const fetchInquiries = (
  status: StatusFilter,
  page: number,
): Promise<AdminSubmissionList> => {
  const query = [statusQuery(status), page > 1 ? `page=${page}` : '']
    .filter(Boolean)
    .join('&');
  return apiFetch<AdminSubmissionList>(
    `/api/admin/submissions${query ? `?${query}` : ''}`,
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

/** URL of the CSV export for a status filter. The browser downloads it. */
export const csvExportUrl = (status: StatusFilter): string => {
  const query = statusQuery(status);
  return `/api/admin/submissions.csv${query ? `?${query}` : ''}`;
};
