import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { signInAsAdmin } from '../../testing/admin-session.ts';
import { mockExternalFetch } from '../../testing/external-fetch.ts';
import {
  createTestWorker,
  ORIGIN,
  type TestWorker,
} from '../../testing/test-worker.ts';
import type { FormField } from './form-definition.ts';
import type { AdminFormState } from './form-admin-routes.ts';

let worker: TestWorker;
let cookie: string;
let external: ReturnType<typeof mockExternalFetch>;

beforeEach(async () => {
  external = mockExternalFetch();
  worker = createTestWorker();
  cookie = await signInAsAdmin(worker);
});
afterEach(() => external.restore());

const get = (path: string) => worker.fetch(path, { headers: { cookie } });

const send = (
  method: string,
  path: string,
  body: unknown,
  { origin = ORIGIN, contentType = 'application/json' } = {},
) =>
  worker.fetch(path, {
    method,
    headers: { cookie, origin, 'content-type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const state = async (): Promise<AdminFormState> =>
  (await get('/api/admin/form')).json();

/** The editor's view of a stored field: what PUT accepts back. */
const editable = (f: FormField) => {
  const { lastVersion: _ignored, ...rest } = f as FormField & {
    lastVersion?: number;
  };
  return rest;
};

const put = async (fields: unknown[], baseVersion?: number) =>
  send('PUT', '/api/admin/form', {
    baseVersion: baseVersion ?? (await state()).current.version,
    fields,
  });

const budget = {
  type: 'select',
  label: { ja: 'ご予算', en: 'Budget' },
  required: true,
  showInList: true,
  options: [
    { label: { ja: '50万円未満', en: 'Under 500k yen' } },
    { label: { ja: '50万円以上', en: '500k yen or more' } },
  ],
};

const rows = () =>
  worker.sqlite
    .query('SELECT * FROM submissions ORDER BY created_at')
    .all() as Record<string, unknown>[];

const contact = (fields: Record<string, unknown>, formVersion?: number) =>
  worker.fetch('/api/contact', {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'visitor@example.org',
      consent: true,
      turnstileToken: 't',
      elapsedMs: 10_000,
      fields,
      ...(formVersion ? { formVersion } : {}),
    }),
  });

describe('GET /api/admin/form', () => {
  test('returns version 1 and its history', async () => {
    const body = await state();
    expect(body.current).toMatchObject({
      version: 1,
      createdBy: null,
      restoredFrom: null,
    });
    expect(body.current.definition.fields.map((f) => f.id)).toEqual([
      'f_name',
      'f_company',
      'f_phone',
      'f_category',
      'f_message',
    ]);
    expect(body.current.definition.archived).toEqual([]);
    expect(body.history).toEqual([
      {
        version: 1,
        createdAt: body.current.createdAt,
        createdBy: null,
        restoredFrom: null,
        fieldCount: 5,
      },
    ]);
  });

  test('version 1 lists name, company, and message in the list', async () => {
    const { fields } = (await state()).current.definition;
    expect(fields.filter((f) => f.showInList).map((f) => f.id)).toEqual([
      'f_name',
      'f_company',
      'f_message',
    ]);
  });
});

describe('PUT /api/admin/form', () => {
  test('saves a new version stamped with the admin', async () => {
    const before = await state();
    const response = await put([
      ...before.current.definition.fields.map(editable),
      budget,
    ]);
    expect(response.status).toBe(200);
    const after: AdminFormState = await response.json();
    expect(after.current).toMatchObject({
      version: 2,
      createdBy: 'admin@example.com',
      restoredFrom: null,
    });
    expect(after.current.createdAt).toBeNumber();
    const added = after.current.definition.fields[5];
    expect(added?.id).toMatch(/^f_[a-z0-9]{16}$/);
    expect(added?.options?.map((o) => o.value)).toHaveLength(2);
    expect(after.history.map((h) => h.version)).toEqual([2, 1]);
    // Version 1 is unchanged.
    const v1 = await (await get('/api/admin/form/versions/1')).json();
    expect(v1.definition).toEqual(before.current.definition);
  });

  test('adds no version when nothing changed', async () => {
    const { current } = await state();
    const response = await put(current.definition.fields.map(editable));
    expect(response.status).toBe(200);
    expect((await response.json()).current.version).toBe(1);
    expect(
      worker.sqlite.query('SELECT COUNT(*) AS n FROM form_definitions').get(),
    ).toEqual({ n: 1 });
  });

  test('a stale baseVersion returns 409', async () => {
    const { current } = await state();
    const fields = current.definition.fields.map(editable);
    expect((await put([...fields, budget], 1)).status).toBe(200);
    const stale = await put(fields.slice(1), 1);
    expect(stale.status).toBe(409);
    expect((await stale.json()).error.code).toBe('form_conflict');
    expect((await state()).current.version).toBe(2);
    expect((await put(fields, 99)).status).toBe(409);
  });

  test('rejects a definition that breaks the meta-schema', async () => {
    const { current } = await state();
    const fields = current.definition.fields.map(editable);
    const cases: unknown[][] = [
      [...fields, { ...budget, options: [] }],
      [...fields, { ...budget, type: 'file' }],
      [...fields, { ...budget, label: { ja: '', en: '' } }],
      [...fields, { ...budget, id: '__proto__' }],
      [...fields, { ...budget, key: 'budget' }],
      [fields[0], fields[0]],
      Array.from({ length: 31 }, () => ({ ...budget })),
      [
        ...fields,
        { ...fields[0], id: undefined, type: 'text', maxLength: 2001 },
      ],
    ];
    for (const body of cases) {
      const response = await put(body);
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe('invalid_input');
    }
    expect((await state()).current.version).toBe(1);
  });

  test('rejects an id the server did not create', async () => {
    const { current } = await state();
    const response = await put([
      ...current.definition.fields.map(editable),
      { ...budget, id: 'f_mine' },
    ]);
    expect(response.status).toBe(400);
    expect((await response.json()).error.fields).toEqual({
      'fields.5': 'unknown_field',
    });
  });

  test('rejects a type change across value shapes', async () => {
    const { current } = await state();
    const fields = current.definition.fields.map(editable);
    const response = await put(
      fields.map((f) => (f.id === 'f_name' ? { ...f, type: 'number' } : f)),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.fields).toEqual({
      'fields.0': 'type_change',
    });
  });

  test('rejects bodies that are not JSON or too large', async () => {
    expect(
      (await send('PUT', '/api/admin/form', '{"baseVersion":', {})).status,
    ).toBe(400);
    expect(
      (
        await send(
          'PUT',
          '/api/admin/form',
          { baseVersion: 1, fields: [] },
          {
            contentType: 'text/plain',
          },
        )
      ).status,
    ).toBe(400);
    const huge = JSON.stringify({
      baseVersion: 1,
      fields: [],
      pad: 'x'.repeat(300_000),
    });
    expect((await send('PUT', '/api/admin/form', huge)).status).toBe(400);
  });

  test('archives removed fields and keeps them in later versions', async () => {
    const { current } = await state();
    const fields = current.definition.fields.map(editable);
    const v2: AdminFormState = await (
      await put(fields.filter((f) => f.id !== 'f_phone'))
    ).json();
    expect(v2.current.definition.archived).toEqual([
      { ...current.definition.fields[2]!, lastVersion: 1 },
    ]);
    const v3: AdminFormState = await (
      await put(v2.current.definition.fields.map(editable).slice(1))
    ).json();
    expect(v3.current.definition.archived.map((f) => f.id)).toEqual([
      'f_name',
      'f_phone',
    ]);
  });
});

describe('restore', () => {
  test('saves the fields of an earlier version as a new version', async () => {
    const { current } = await state();
    const fields = current.definition.fields.map(editable);
    await put(fields.filter((f) => f.id !== 'f_phone'));
    const response = await send('POST', '/api/admin/form/versions/1/restore', {
      baseVersion: 2,
    });
    expect(response.status).toBe(200);
    const after: AdminFormState = await response.json();
    expect(after.current).toMatchObject({
      version: 3,
      restoredFrom: 1,
      createdBy: 'admin@example.com',
    });
    expect(after.current.definition.fields).toEqual(current.definition.fields);
    expect(after.current.definition.archived).toEqual([]);
  });

  test('checks the base version and the restored version', async () => {
    expect(
      (
        await send('POST', '/api/admin/form/versions/1/restore', {
          baseVersion: 5,
        })
      ).status,
    ).toBe(409);
    for (const path of ['9', '0', 'abc', '1.5', "1' OR '1'='1"]) {
      const response = await send(
        'POST',
        `/api/admin/form/versions/${encodeURIComponent(path)}/restore`,
        { baseVersion: 1 },
      );
      expect(response.status).toBe(404);
    }
    expect(
      (await send('POST', '/api/admin/form/versions/1/restore', {})).status,
    ).toBe(400);
    expect((await get('/api/admin/form/versions/2')).status).toBe(404);
  });
});

describe('authorization', () => {
  test('a foreign Origin cannot save or restore', async () => {
    const { current } = await state();
    const fields = current.definition.fields.map(editable);
    for (const origin of ['https://evil.example', 'null', '']) {
      const saved = await send(
        'PUT',
        '/api/admin/form',
        { baseVersion: 1, fields: [...fields, budget] },
        { origin },
      );
      expect(saved.status).toBe(403);
      const restored = await send(
        'POST',
        '/api/admin/form/versions/1/restore',
        { baseVersion: 1 },
        { origin },
      );
      expect(restored.status).toBe(403);
    }
    expect((await state()).current.version).toBe(1);
  });

  test('without a session every form route returns 401', async () => {
    const anonymous = createTestWorker();
    for (const [method, path] of [
      ['GET', '/api/admin/form'],
      ['PUT', '/api/admin/form'],
      ['GET', '/api/admin/form/versions/1'],
      ['POST', '/api/admin/form/versions/1/restore'],
    ] as const) {
      const response = await anonymous.fetch(path, {
        method,
        headers: { origin: ORIGIN, 'content-type': 'application/json' },
        body: method === 'GET' ? undefined : '{"baseVersion":1,"fields":[]}',
      });
      expect(response.status).toBe(401);
    }
    expect(
      anonymous.sqlite
        .query('SELECT COUNT(*) AS n FROM form_definitions')
        .get(),
    ).toEqual({ n: 1 });
  });

  test('an address outside ADMIN_EMAILS gets 403', async () => {
    worker.env.ADMIN_EMAILS = 'someone-else@example.com';
    const response = await send('PUT', '/api/admin/form', {
      baseVersion: 1,
      fields: [],
    });
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('forbidden');
    // The 403 also deleted the user's sessions.
    expect((await get('/api/admin/form')).status).toBe(401);
    expect(
      worker.sqlite.query('SELECT COUNT(*) AS n FROM form_definitions').get(),
    ).toEqual({ n: 1 });
  });
});

describe('form_definitions is append-only', () => {
  test('UPDATE and DELETE are refused by triggers', () => {
    expect(() =>
      worker.sqlite.exec(
        "UPDATE form_definitions SET definition = '{}' WHERE version = 1",
      ),
    ).toThrow('append-only');
    expect(() =>
      worker.sqlite.exec('DELETE FROM form_definitions WHERE version = 1'),
    ).toThrow('append-only');
    expect(
      worker.sqlite.query('SELECT COUNT(*) AS n FROM form_definitions').get(),
    ).toEqual({ n: 1 });
  });
});

describe('contact API after an edit', () => {
  test('validates against the new version and stores it', async () => {
    const { current } = await state();
    const fields = current.definition.fields
      .map(editable)
      .filter((f) => f.id !== 'f_category');
    const after: AdminFormState = await (await put([...fields, budget])).json();
    const added = after.current.definition.fields.at(-1)!;
    const option = added.options![0]!.value;

    const form = await (await worker.fetch('/api/contact/form')).json();
    expect(form.version).toBe(2);
    expect(form.fields.map((f: { id: string }) => f.id)).toContain(added.id);
    expect(form.fields.map((f: { id: string }) => f.id)).not.toContain(
      'f_category',
    );

    // The new field is required.
    const missing = await contact({ f_name: 'Taro', f_message: 'Hi' }, 2);
    expect(missing.status).toBe(400);
    expect((await missing.json()).error.fields).toEqual({
      [added.id]: 'required',
    });
    // The removed field is now unknown.
    const removed = await contact(
      {
        f_name: 'Taro',
        f_message: 'Hi',
        f_category: 'sales',
        [added.id]: option,
      },
      2,
    );
    expect(removed.status).toBe(400);
    expect((await removed.json()).error.fields).toEqual({ fields: 'invalid' });
    // A visitor who loaded version 1 is told to reload.
    const stale = await contact(
      { f_name: 'Taro', f_message: 'Hi', f_category: 'sales' },
      1,
    );
    expect(stale.status).toBe(409);
    expect((await stale.json()).error.code).toBe('form_outdated');

    const ok = await contact(
      { f_name: 'Taro', f_message: 'Hi', [added.id]: option },
      2,
    );
    expect(ok.status).toBe(200);
    const [row] = rows();
    expect(row?.form_version).toBe(2);
    expect(JSON.parse(String(row?.fields))).toEqual({
      f_name: 'Taro',
      f_message: 'Hi',
      [added.id]: option,
    });
    expect(rows()).toHaveLength(1);
  });

  test('a restored field validates and stores under its old id', async () => {
    const { current } = await state();
    const fields = current.definition.fields.map(editable);
    await put(fields.filter((f) => f.id !== 'f_phone'));
    await send('POST', '/api/admin/form/versions/1/restore', {
      baseVersion: 2,
    });
    const ok = await contact(
      {
        f_name: 'Taro',
        f_message: 'Hi',
        f_category: 'press',
        f_phone: '03-0000',
      },
      3,
    );
    expect(ok.status).toBe(200);
    expect(rows()[0]).toMatchObject({ form_version: 3 });
    expect(JSON.parse(String(rows()[0]?.fields)).f_phone).toBe('03-0000');
  });
});
