import type { FormUpdate } from '../../../../src/features/contact-form/form-definition.ts';
import type { AdminFormState } from '../../../../src/features/contact-form/form-admin-routes.ts';
import type { FormVersion } from '../../../../src/features/contact-form/form-store.ts';
import { apiFetch } from '../../shared/api/api-client.ts';

/** The API body of a form update, before the server fills in defaults. */
export type FormUpdateBody = Omit<FormUpdate, 'fields'> & {
  fields: (Omit<FormUpdate['fields'][number], 'showInList'> & {
    showInList: boolean;
  })[];
};

/** `GET /api/admin/form`: the current version and the history. */
export const fetchFormState = (): Promise<AdminFormState> =>
  apiFetch<AdminFormState>('/api/admin/form');

/**
 * `PUT /api/admin/form`: saves the fields as a new version.
 *
 * @throws {ApiError} `form_conflict` (409) when someone saved first, or
 *   `invalid_input` (400) with per-field codes.
 */
export const saveForm = (body: FormUpdateBody): Promise<AdminFormState> =>
  apiFetch<AdminFormState>('/api/admin/form', {
    method: 'PUT',
    body: JSON.stringify(body),
  });

/** `GET /api/admin/form/versions/:version`. */
export const fetchFormVersion = (version: number): Promise<FormVersion> =>
  apiFetch<FormVersion>(`/api/admin/form/versions/${version}`);

/** `POST /api/admin/form/versions/:version/restore`. */
export const restoreFormVersion = (
  version: number,
  baseVersion: number,
): Promise<AdminFormState> =>
  apiFetch<AdminFormState>(`/api/admin/form/versions/${version}/restore`, {
    method: 'POST',
    body: JSON.stringify({ baseVersion }),
  });
