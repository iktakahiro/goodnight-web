import { expect, test } from 'bun:test';
import { csvExportUrl } from './inquiries-api.ts';
import { listQuery, listSearch, listSearchSchema } from './list-search.ts';

const parse = (input: Record<string, unknown>) => listSearchSchema.parse(input);

test('view accepts the views; anything else means all', () => {
  expect(parse({ view: 'unread' }).view).toBe('unread');
  expect(parse({ view: 'read' }).view).toBe('read');
  expect(parse({ view: 'spam' }).view).toBe('spam');
  for (const view of ['all', 'held', 'done', 'new', 3, null, undefined]) {
    expect(parse({ view }).view).toBeUndefined();
  }
  expect(listQuery(parse({})).view).toBe('all');
});

test('page accepts whole numbers from 2; anything else is the first page', () => {
  expect(parse({ page: 3 }).page).toBe(3);
  expect(parse({ page: '3' }).page).toBe(3);
  for (const page of [1, 0, -2, 1.5, 'abc', 100_001, null, undefined]) {
    expect(parse({ page }).page).toBeUndefined();
  }
});

test('only the order by received time can change', () => {
  expect(parse({ dir: 'asc' }).dir).toBe('asc');
  expect(parse({ dir: 'desc' }).dir).toBeUndefined();
  expect(parse({ dir: 'sideways' }).dir).toBeUndefined();
  expect(parse({ sort: 'email' })).not.toHaveProperty('sort');
});

test('the email search is trimmed and at most 254 characters', () => {
  expect(parse({ q: '  taro@example ' }).q).toBe('taro@example');
  expect(parse({ q: '   ' }).q).toBeUndefined();
  expect(parse({ q: 'a'.repeat(254) }).q).toHaveLength(254);
  expect(parse({ q: 'a'.repeat(255) }).q).toBeUndefined();
  expect(parse({ q: 3 }).q).toBeUndefined();
});

test('field filters accept well-formed ids and values only', () => {
  expect(parse({ field: 'f_category', value: 'press' })).toMatchObject({
    field: 'f_category',
    value: 'press',
  });
  for (const field of ['__proto__', 'f_', "f_x') OR 1=1", '$.f_a', 'F_A']) {
    expect(parse({ field }).field).toBeUndefined();
  }
  expect(parse({ value: 'a"b' }).value).toBeUndefined();
  expect(parse({ version: '2' }).version).toBe(2);
  expect(parse({ version: '0' }).version).toBeUndefined();
});

test('ignores unknown parameters', () => {
  expect(parse({ status: 'new', sort: 'email', page: 2 })).toEqual({
    view: undefined,
    q: undefined,
    page: 2,
    dir: undefined,
    version: undefined,
    field: undefined,
    value: undefined,
  });
});

test('listSearch leaves out defaults and round-trips with listQuery', () => {
  expect(listSearch()).toEqual(parse({}));
  expect(listSearch({ view: 'all' }).view).toBeUndefined();
  expect(listSearch({ view: 'spam' })).toMatchObject({ view: 'spam' });
  const query = listQuery(
    parse({ view: 'read', page: '3', dir: 'asc', q: 'example' }),
  );
  expect(query).toMatchObject({
    view: 'read',
    page: 3,
    dir: 'asc',
    q: 'example',
  });
  expect(listQuery(listSearch(query))).toEqual(query);
  expect(listQuery(parse({ field: 'f_a' }))).not.toHaveProperty('field');
});

test('the CSV link carries the view, search, filters, and language', () => {
  expect(
    csvExportUrl(
      {
        view: 'unread',
        q: 'a_b@x',
        version: 2,
        field: 'f_a',
        value: 'b',
        page: 3,
      },
      'ja',
    ),
  ).toBe(
    '/api/admin/submissions.csv?view=unread&q=a_b%40x&version=2&field=f_a&value=b&lang=ja',
  );
  expect(csvExportUrl({ view: 'all' }, 'en')).toBe(
    '/api/admin/submissions.csv?lang=en',
  );
});
