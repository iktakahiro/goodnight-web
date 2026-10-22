import { beforeEach, describe, expect, test } from 'bun:test';
import { signInAsAdmin } from '../../testing/admin-session.ts';
import { captureConsole } from '../../testing/console-capture.ts';
import { testSubmission } from '../../testing/submissions.ts';
import {
  createTestWorker,
  ORIGIN,
  type TestWorker,
} from '../../testing/test-worker.ts';
import type { FormField } from '../contact-form/form-definition.ts';
import type { AdminFormState } from '../contact-form/form-admin-routes.ts';
import { insertSubmission } from '../submissions/submission-store.ts';
import type { NewSubmission } from '../submissions/submission-store.ts';

// Version 2 of the form: "Name" renamed to "Full name", the "Sales" option
// relabeled, Phone removed (archived), and a "Budget" radio and a new
// "Phone" field (same label as the archived one, new id) added.
let worker: TestWorker;
let cookie: string;
let v2: AdminFormState;
let budgetId: string;
let newPhoneId: string;
let under: string;

const get = (path: string) => worker.fetch(path, { headers: { cookie } });
const json = async (path: string) => {
  const response = await get(path);
  expect(response.status).toBe(200);
  return response.json();
};

const editable = (f: FormField) => {
  const { lastVersion: _ignored, ...rest } = f as FormField & {
    lastVersion?: number;
  };
  return rest;
};

const seed = (id: string, overrides: Partial<NewSubmission>) =>
  insertSubmission(worker.env.DB, testSubmission(id, overrides));

beforeEach(async () => {
  worker = createTestWorker();
  cookie = await signInAsAdmin(worker);
  const v1: AdminFormState = await json('/api/admin/form');
  const fields = v1.current.definition.fields.map(editable).flatMap((f) => {
    if (f.id === 'f_phone') return [];
    if (f.id === 'f_name')
      return [{ ...f, label: { ja: '氏名', en: 'Full name' } }];
    if (f.id === 'f_category') {
      return [
        {
          ...f,
          options: f.options?.map((o) =>
            o.value === 'sales'
              ? { ...o, label: { ja: '営業のご提案', en: 'Sales pitch' } }
              : o,
          ),
        },
      ];
    }
    return [f];
  });
  const response = await worker.fetch('/api/admin/form', {
    method: 'PUT',
    headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify({
      baseVersion: 1,
      fields: [
        ...fields,
        {
          type: 'radio',
          label: { ja: 'ご予算', en: 'Budget' },
          required: false,
          showInList: true,
          options: [
            { label: { ja: '少なめ', en: 'Small' } },
            { label: { ja: '多め', en: 'Large' } },
          ],
        },
        {
          type: 'tel',
          label: { ja: '電話番号', en: 'Phone' },
          required: false,
          showInList: false,
        },
      ],
    }),
  });
  expect(response.status).toBe(200);
  v2 = await response.json();
  const added = v2.current.definition.fields.slice(-2);
  budgetId = added[0]!.id;
  newPhoneId = added[1]!.id;
  under = added[0]!.options![0]!.value;
  const now = Date.now();
  await seed('old', {
    createdAt: now - 3000,
    email: 'b@example.org',
    formVersion: 1,
    fields: {
      f_name: 'Old Visitor',
      f_phone: '03-1111-2222',
      f_category: 'sales',
      f_message: 'From version 1',
    },
  });
  await seed('new', {
    createdAt: now - 2000,
    email: 'c@example.org',
    status: 'read',
    formVersion: 2,
    fields: {
      f_name: 'New Visitor',
      f_category: 'press',
      f_message: 'x'.repeat(300),
      [budgetId]: under,
      [newPhoneId]: '090-0000-0000',
    },
  });
  await seed('newest', {
    createdAt: now - 1000,
    email: 'a@example.org',
    formVersion: 2,
    fields: { f_name: 'Third', f_category: 'sales', f_message: 'Hi' },
  });
});

describe('admin list', () => {
  test('columns are the current fields with showInList', async () => {
    const list = await json('/api/admin/submissions');
    expect(list.formVersion).toBe(2);
    expect(
      list.columns.map((c: { id: string; showInList: boolean }) => [
        c.id,
        c.showInList,
      ]),
    ).toEqual([
      ['f_name', true],
      ['f_company', true],
      ['f_category', false],
      ['f_message', true],
      [budgetId, true],
      [newPhoneId, false],
    ]);
    expect(list.columns[0].label).toEqual({ ja: '氏名', en: 'Full name' });
    expect(list.columns[2].options).toHaveLength(5);
    expect(list.columns[3]).not.toHaveProperty('options');
  });

  test('items hold current fields only, labeled by their own version', async () => {
    const list = await json('/api/admin/submissions');
    const byId = Object.fromEntries(
      list.items.map((item: { id: string }) => [item.id, item]),
    );
    expect(Object.keys(byId.old.fields)).toEqual([
      'f_name',
      'f_category',
      'f_message',
    ]);
    // The archived phone value is not in the list.
    expect(JSON.stringify(byId.old)).not.toContain('03-1111-2222');
    // Option labels come from each row's own version.
    expect(byId.old.fields.f_category).toEqual({
      kind: 'choices',
      choices: [
        {
          value: 'sales',
          label: { ja: '営業・ご提案', en: 'Business proposal' },
        },
      ],
    });
    expect(byId.newest.fields.f_category.choices[0].label.en).toBe(
      'Sales pitch',
    );
    expect(byId.new.fields[budgetId].choices[0].label.en).toBe('Small');
    // Long text is cut.
    expect(byId.new.fields.f_message.text).toBe(`${'x'.repeat(120)}…`);
    expect(byId.new).toMatchObject({
      email: 'c@example.org',
      status: 'read',
      suspectedSpam: false,
      formVersion: 2,
    });
    expect(byId.new).not.toHaveProperty('ipHash');
  });

  test('filters by view, version, and a choice field', async () => {
    const ids = async (query: string) =>
      (await json(`/api/admin/submissions?${query}`)).items.map(
        (item: { id: string }) => item.id,
      );
    expect(await ids('view=read')).toEqual(['new']);
    expect(await ids('version=1')).toEqual(['old']);
    expect(await ids('version=2')).toEqual(['newest', 'new']);
    expect(await ids('field=f_category&value=sales')).toEqual([
      'newest',
      'old',
    ]);
    expect(await ids(`field=${budgetId}&value=${under}`)).toEqual(['new']);
    expect(await ids('field=f_category&value=press&view=unread')).toEqual([]);
    const counted = await json(
      '/api/admin/submissions?field=f_category&value=sales',
    );
    expect(counted.total).toBe(2);
  });

  test('sorts by received time only', async () => {
    const ids = async (query: string) =>
      (await json(`/api/admin/submissions?${query}`)).items.map(
        (item: { id: string }) => item.id,
      );
    expect(await ids('')).toEqual(['newest', 'new', 'old']);
    expect(await ids('dir=desc')).toEqual(['newest', 'new', 'old']);
    expect(await ids('dir=asc')).toEqual(['old', 'new', 'newest']);
    for (const sort of ['email', 'status', 'received_at', 'f_name']) {
      expect((await get(`/api/admin/submissions?sort=${sort}`)).status).toBe(
        400,
      );
    }
  });

  const INJECTIONS: Record<string, string>[] = [
    { field: "f_category') OR 1=1 --", value: 'sales' },
    { field: 'f_category"', value: 'sales' },
    { field: '$.f_category', value: 'sales' },
    { field: 'f_category', value: "sales' OR '1'='1" },
    { field: 'f_category', value: 'sales"); DROP TABLE submissions; --' },
    { field: 'f_category', value: 'nope' },
    { field: 'f_name', value: 'taro' },
    { field: 'f_message', value: 'hi' },
    { field: 'f_phone', value: 'x' },
    { field: 'f_unknown', value: 'sales' },
    { field: '__proto__', value: 'sales' },
    { field: 'constructor', value: 'sales' },
    { field: 'f_category' },
    { value: 'sales' },
    { keyword: 'Visitor' },
    { search: 'Visitor' },
    { field: 'f_category', value: 'sales', sort: 'email' },
  ];

  test('the search matches the email address, never the form fields', async () => {
    const ids = async (q: string) =>
      (
        await json(`/api/admin/submissions?${new URLSearchParams({ q })}`)
      ).items.map((item: { id: string }) => item.id);
    expect(await ids('Visitor')).toEqual([]);
    expect(await ids('From version')).toEqual([]);
    expect(await ids('C@EXAMPLE')).toEqual(['new']);
    expect(await ids('example.org')).toEqual(['newest', 'new', 'old']);
  });

  test.each(INJECTIONS)(
    'rejects %p with 400 and runs no query',
    async (params) => {
      const logs = captureConsole();
      try {
        for (const path of [
          '/api/admin/submissions',
          '/api/admin/submissions.csv',
        ]) {
          const response = await get(`${path}?${new URLSearchParams(params)}`);
          expect(response.status).toBe(400);
          expect((await response.json()).error.code).toBe('invalid_input');
        }
        expect(logs.text()).toBe('');
      } finally {
        logs.restore();
      }
      expect(
        worker.sqlite.query('SELECT COUNT(*) AS n FROM submissions').get(),
      ).toEqual({ n: 3 });
    },
  );

  test('there is no search endpoint', async () => {
    for (const path of [
      '/api/admin/search?q=Visitor',
      '/api/admin/submissions/search?q=Visitor',
    ]) {
      const response = await get(path);
      expect(response.status).toBe(404);
    }
  });
});

describe('admin detail', () => {
  test('a version 1 submission keeps its own labels', async () => {
    const detail = await json('/api/admin/submissions/old');
    expect(detail.formVersion).toBe(1);
    expect(detail.currentFormVersion).toBe(2);
    const entries = Object.fromEntries(
      detail.entries.map((entry: { id: string }) => [entry.id, entry]),
    );
    expect(detail.entries.map((entry: { id: string }) => entry.id)).toEqual([
      'f_name',
      'f_company',
      'f_phone',
      'f_category',
      'f_message',
    ]);
    expect(entries.f_name).toEqual({
      id: 'f_name',
      type: 'text',
      label: { ja: 'お名前', en: 'Name' },
      value: { kind: 'text', text: 'Old Visitor' },
      inCurrentForm: true,
    });
    expect(entries.f_phone).toMatchObject({
      label: { ja: '電話番号', en: 'Phone' },
      value: { kind: 'text', text: '03-1111-2222' },
      inCurrentForm: false,
    });
    expect(entries.f_company.value).toBeNull();
    expect(entries.f_category.value.choices[0].label.en).toBe(
      'Business proposal',
    );
  });

  test('a version 2 submission uses the version 2 labels', async () => {
    const detail = await json('/api/admin/submissions/new');
    const entries = Object.fromEntries(
      detail.entries.map((entry: { id: string }) => [entry.id, entry]),
    );
    expect(entries.f_name.label).toEqual({ ja: '氏名', en: 'Full name' });
    expect(entries[newPhoneId]).toMatchObject({
      label: { ja: '電話番号', en: 'Phone' },
      inCurrentForm: true,
    });
    expect(entries.f_phone).toBeUndefined();
    // The full text, not the list excerpt.
    expect(entries.f_message.value.text).toBe('x'.repeat(300));
  });

  test('values with an id the version does not list are still shown', async () => {
    worker.sqlite.exec(
      `UPDATE submissions SET fields = json_set(fields, '$.f_ghost', 'kept') WHERE id = 'old'`,
    );
    const detail = await json('/api/admin/submissions/old');
    expect(detail.entries.at(-1)).toEqual({
      id: 'f_ghost',
      type: 'text',
      label: null,
      value: { kind: 'text', text: 'kept' },
      inCurrentForm: false,
    });
  });
});

describe('CSV export', () => {
  const csv = async (query = '') => {
    const response = await get(`/api/admin/submissions.csv${query}`);
    expect(response.status).toBe(200);
    return (await response.text()).split('\r\n').filter((line) => line !== '');
  };

  test('has one column per field id across versions', async () => {
    const [header] = await csv('?lang=en');
    expect(header).toBe(
      [
        'id',
        'received_at',
        'status',
        'suspected_spam',
        'email',
        'locale',
        'form_version',
        'page_path',
        'country',
        'spam_score',
        'spam_reasons',
        'Full name',
        'Company or organization',
        'Category',
        'Message',
        'Budget',
        'Phone',
        'Phone (v1)',
      ]
        .map((cell) => `"${cell}"`)
        .join(','),
    );
  });

  test('uses Japanese headers with lang=ja and the site locale by default', async () => {
    const [ja] = await csv('?lang=ja');
    expect(ja).toContain('"氏名","会社名・団体名","お問い合わせの種類"');
    expect(ja).toContain('"電話番号","電話番号 (v1)"');
    const [fallback] = await csv();
    expect(fallback).toContain('"Full name"');
    expect((await get('/api/admin/submissions.csv?lang=fr')).status).toBe(400);
  });

  test('keeps old and new values of the same label in separate columns', async () => {
    const lines = await csv('?lang=en');
    const cells = (id: string) =>
      lines.find((line) => line.startsWith(`"${id}"`))!.split('","');
    // Phone (v1) is the last column, Phone (new) the one before it.
    expect(cells('old').at(-1)).toBe('03-1111-2222"');
    expect(cells('old').at(-2)).toBe('');
    expect(cells('new').at(-2)).toBe('090-0000-0000');
    expect(cells('new').at(-1)).toBe('"');
  });

  test("labels options with the row's own version", async () => {
    const lines = await csv('?lang=en');
    expect(lines.find((line) => line.startsWith('"old"'))).toContain(
      '"Business proposal"',
    );
    expect(lines.find((line) => line.startsWith('"newest"'))).toContain(
      '"Sales pitch"',
    );
    expect(lines.find((line) => line.startsWith('"new"'))).toContain('"Small"');
  });

  test('adds an id when two current fields share a label', async () => {
    const { current } = (await json('/api/admin/form')) as AdminFormState;
    const response = await worker.fetch('/api/admin/form', {
      method: 'PUT',
      headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({
        baseVersion: current.version,
        fields: [
          ...current.definition.fields.map(editable),
          { type: 'text', label: { ja: 'メモ', en: 'Note' }, required: false },
          { type: 'text', label: { ja: 'メモ', en: 'Note' }, required: false },
        ],
      }),
    });
    const ids = (
      (await response.json()) as AdminFormState
    ).current.definition.fields
      .slice(-2)
      .map((f) => f.id);
    const [header] = await csv('?lang=en');
    expect(header).toContain(`"Note [${ids[0]}]","Note [${ids[1]}]"`);
  });

  test('filters like the list', async () => {
    const lines = await csv('?version=1');
    expect(lines).toHaveLength(2);
    expect(lines[1]?.startsWith('"old"')).toBe(true);
    expect(await csv('?field=f_category&value=press')).toHaveLength(2);
  });

  test('leaves rows of a version saved during the export for the next one', async () => {
    const pause = worker.pauseAt(/^select .* from "submissions"/s);
    const response = await get('/api/admin/submissions.csv?lang=en');
    expect(response.status).toBe(200);
    const text = response.text();
    await pause.reached;
    const { current } = (await json('/api/admin/form')) as AdminFormState;
    const saved = await worker.fetch('/api/admin/form', {
      method: 'PUT',
      headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({
        baseVersion: current.version,
        fields: [
          ...current.definition.fields.map(editable),
          {
            type: 'text',
            label: { ja: '部署', en: 'Department' },
            required: false,
          },
        ],
      }),
    });
    expect(saved.status).toBe(200);
    const v3: AdminFormState = await saved.json();
    const departmentId = v3.current.definition.fields.at(-1)!.id;
    await seed('during', {
      formVersion: v3.current.version,
      fields: { f_name: 'During Export', [departmentId]: 'Sales' },
    });
    pause.release();
    const lines = (await text).split('\r\n').filter((line) => line !== '');
    expect(lines[0]).not.toContain('"Department"');
    expect(lines.some((line) => line.startsWith('"during"'))).toBe(false);
    expect(lines.some((line) => line.startsWith('"new"'))).toBe(true);

    const next = await csv('?lang=en');
    expect(next[0]).toContain('"Department"');
    expect(next.find((line) => line.startsWith('"during"'))).toContain(
      '"Sales"',
    );
  });

  test.each([
    '=HYPERLINK("https://evil.example")',
    '+1+1',
    '-2+3',
    '@SUM(A1)',
    '\tleading tab',
    '  =after spaces',
  ])('guards the dynamic value %p against formulas', async (text) => {
    await seed('formula', {
      formVersion: 2,
      fields: { f_name: text, f_message: text, [newPhoneId]: text },
    });
    const line = (await csv()).find((row) => row.startsWith('"formula"'))!;
    const quoted = `"'${text.replace(/"/g, '""')}"`;
    expect(line.split(quoted).length - 1).toBe(3);
  });
});
