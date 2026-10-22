import type { AdminStatus } from '../../../../src/features/admin-api/admin-routes.ts';
import type { SetupState } from '../../../../src/features/setup/setup-routes.ts';
import { apiFetch } from '../../shared/api/api-client.ts';

/** The signed-in admin, as `GET /api/admin/me` returns it. */
export interface AdminUser {
  userId: string;
  email: string;
  name: string;
}

/** `GET /api/admin/me`. Throws `ApiError` 401 without a session. */
export const fetchMe = (): Promise<AdminUser> =>
  apiFetch<AdminUser>('/api/admin/me');

/** `GET /api/admin/status`: settings and the unread count. */
export const fetchStatus = (): Promise<AdminStatus> =>
  apiFetch<AdminStatus>('/api/admin/status');

/** `GET /api/setup`: whether the first-admin setup is configured and open. */
export const fetchSetupState = (): Promise<SetupState> =>
  apiFetch<SetupState>('/api/setup');
