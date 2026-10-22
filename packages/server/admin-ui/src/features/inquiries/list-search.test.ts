import { expect, test } from 'bun:test';
import { listSearch, listSearchSchema } from './list-search.ts';

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

test('ignores unknown parameters', () => {
  expect(parse({ sort: 'oldest', page: 2 })).toEqual({
    status: undefined,
    page: 2,
  });
});

test('listSearch leaves out defaults', () => {
  expect(listSearch('all')).toEqual({ status: undefined, page: undefined });
  expect(listSearch('new')).toEqual({ status: 'new', page: undefined });
  expect(listSearch('done', 3)).toEqual({ status: 'done', page: 3 });
});
