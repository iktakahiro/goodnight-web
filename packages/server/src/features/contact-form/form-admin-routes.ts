import { Hono, type Context } from 'hono';
import type * as z from 'zod';
import type { HonoEnv } from '../../hono-env.ts';
import { apiError } from '../../shared/api-error.ts';
import { readBodyWithLimit } from '../../shared/request.ts';
import { formUpdateSchema } from './form-definition.ts';
import {
  applyFormEdit,
  isSameDefinition,
  restoreFormVersion,
} from './form-edit.ts';
import {
  getCurrentForm,
  getFormVersion,
  insertFormVersion,
  listFormHistory,
  type FormVersion,
  type FormVersionSummary,
} from './form-store.ts';

/** Largest accepted body of a form update, in bytes. */
const MAX_FORM_BODY_BYTES = 256 * 1024;

/** Body of `GET /api/admin/form`. */
export interface AdminFormState {
  current: FormVersion;
  /** The newest versions, newest first (at most 50). */
  history: FormVersionSummary[];
}

const issueFields = (error: z.ZodError): Record<string, string> => {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    fields[key] ??=
      issue.code === 'custom' || issue.message.startsWith('max_length')
        ? issue.message
        : issue.code;
  }
  return fields;
};

const readJson = async (c: Context<HonoEnv>): Promise<unknown> => {
  if (!/^application\/json\s*(;|$)/i.test(c.req.header('content-type') ?? '')) {
    return undefined;
  }
  const text = await readBodyWithLimit(c.req.raw, MAX_FORM_BODY_BYTES);
  if (text === null) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

const parseVersion = (value: string): number | null =>
  /^[1-9][0-9]{0,6}$/.test(value) ? Number(value) : null;

const state = async (c: Context<HonoEnv>): Promise<AdminFormState> => {
  const [current, history] = await Promise.all([
    getCurrentForm(c.env.DB),
    listFormHistory(c.env.DB),
  ]);
  return { current, history };
};

/**
 * Admin routes for the contact form definition, under `/api/admin/form`.
 * Mounted inside the admin API, so {@link requireAdmin} (session, passkey,
 * `ADMIN_EMAILS`, and the `Origin` check for writes) runs first.
 *
 * - `GET /`: {@link AdminFormState}.
 * - `PUT /` with `{ baseVersion, fields }`: validates the fields with
 *   {@link formUpdateSchema} and saves them as a new version. 409
 *   `form_conflict` when `baseVersion` is not the current version. A save
 *   without changes returns the current state and adds no version.
 * - `GET /versions/:version`: one version with its definition.
 * - `POST /versions/:version/restore` with `{ baseVersion }`: saves the
 *   fields of that version as a new version.
 *
 * Both writes answer with {@link AdminFormState}.
 */
export const formAdminRoutes = new Hono<HonoEnv>()
  .get('/', async (c) => c.json(await state(c)))
  .put('/', async (c) => {
    const body = await readJson(c);
    if (body === undefined) return apiError(c, 400, 'invalid_json');
    const parsed = formUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(c, 400, 'invalid_input', issueFields(parsed.error));
    }
    const { baseVersion, fields } = parsed.data;
    const current = await getCurrentForm(c.env.DB);
    if (current.version !== baseVersion) {
      return apiError(c, 409, 'form_conflict');
    }
    const edit = applyFormEdit(current.definition, current.version, fields);
    if (!edit.ok) {
      return apiError(c, 400, 'invalid_input', {
        [`fields.${edit.fieldIndex}`]: edit.error,
      });
    }
    if (!isSameDefinition(edit.definition, current.definition)) {
      const saved = await insertFormVersion(c.env.DB, {
        baseVersion,
        definition: edit.definition,
        createdBy: c.get('admin').email,
      });
      if (!saved) return apiError(c, 409, 'form_conflict');
    }
    return c.json(await state(c));
  })
  .get('/versions/:version', async (c) => {
    const number = parseVersion(c.req.param('version'));
    const version = number ? await getFormVersion(c.env.DB, number) : null;
    if (!version) return apiError(c, 404, 'not_found');
    return c.json(version);
  })
  .post('/versions/:version/restore', async (c) => {
    const body = await readJson(c);
    const baseVersion =
      typeof body === 'object' && body !== null && 'baseVersion' in body
        ? body.baseVersion
        : undefined;
    if (typeof baseVersion !== 'number' || !Number.isInteger(baseVersion)) {
      return apiError(c, 400, 'invalid_input', { baseVersion: 'invalid' });
    }
    const number = parseVersion(c.req.param('version'));
    const earlier = number ? await getFormVersion(c.env.DB, number) : null;
    if (!earlier) return apiError(c, 404, 'not_found');
    const current = await getCurrentForm(c.env.DB);
    if (current.version !== baseVersion) {
      return apiError(c, 409, 'form_conflict');
    }
    const saved = await insertFormVersion(c.env.DB, {
      baseVersion,
      definition: restoreFormVersion(
        current.definition,
        current.version,
        earlier.definition,
      ),
      createdBy: c.get('admin').email,
      restoredFrom: earlier.version,
    });
    if (!saved) return apiError(c, 409, 'form_conflict');
    return c.json(await state(c));
  });
