import { expect, test } from 'bun:test';
import { csvExportUrl } from './inquiries-api.ts';
import { listQuery, listSearch, listSearchSchema } from './list-search.ts';

const parse = (input: Record<string, unknown>) => listSearchSchema.parse(input);

test('status accepts statuses; anything else means every status', () => {
  expect(parse({ status: 'new' }).status).toBe('new');
  expect(parse({ status: 'spam' }).status).toBe('spam');
  for (const status of ['all', 'deleted', 3, null, undefined]) {
    expect(parse({ status }).status).toBeUndefined();
  }
});

test('page accepts whole numbers from 2; anything else is the first page', () => {
  expect(parse({ page: 3 }).page).toBe(3);
  expect(parse({ page: '3' }).page).toBe(3);
  for (const page of [1, 0, -2, 1.5, 'abc', 100_001, null, undefined]) {
    expect(parse({ page }).page).toBeUndefined();
  }
});

test('sort accepts the fixed columns only', () => {
  expect(parse({ sort: 'email', dir: 'asc' })).toMatchObject({
    sort: 'email',
    dir: 'asc',
  });
  for (const sort of ['received_at', 'f_name', 'name', "email'--"]) {
    expect(parse({ sort }).sort).toBeUndefined();
  }
  expect(parse({ dir: 'sideways' }).dir).toBeUndefined();
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

test('ignores unknown parameters, including a keyword search', () => {
  expect(parse({ q: 'hello', page: 2 })).toEqual({
    status: undefined,
    page: 2,
    sort: undefined,
    dir: undefined,
    version: undefined,
    field: undefined,
    value: undefined,
  });
});

test('listSearch leaves out defaults and round-trips with listQuery', () => {
  expect(listSearch()).toEqual(parse({}));
  expect(listSearch({ status: 'new' })).toMatchObject({ status: 'new' });
  const query = listQuery(
    parse({ status: 'done', page: '3', sort: 'status', dir: 'asc' }),
  );
  expect(query).toMatchObject({
    status: 'done',
    page: 3,
    sort: 'status',
    dir: 'asc',
  });
  expect(listQuery(listSearch(query))).toEqual(query);
  expect(listQuery(parse({ field: 'f_a' }))).not.toHaveProperty('field');
});

test('the CSV link carries the filters and the language', () => {
  expect(
    csvExportUrl(
      { status: 'new', version: 2, field: 'f_a', value: 'b', page: 3 },
      'ja',
    ),
  ).toBe(
    '/api/admin/submissions.csv?status=new&version=2&field=f_a&value=b&lang=ja',
  );
  expect(csvExportUrl({ status: 'all' }, 'en')).toBe(
    '/api/admin/submissions.csv?lang=en',
  );
});
