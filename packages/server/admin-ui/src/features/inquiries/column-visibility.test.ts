import { expect, test } from 'bun:test';
import type { AdminListColumn } from '../../../../src/features/admin-api/admin-routes.ts';
import { columnVisibility, parseColumnChoices } from './column-visibility.ts';

const column = (id: string, showInList: boolean): AdminListColumn => ({
  id,
  type: 'text',
  label: { ja: id, en: id },
  showInList,
});

test('defaults come from showInList', () => {
  expect(
    columnVisibility([column('f_name', true), column('f_phone', false)], {}),
  ).toEqual({ f_name: true, f_phone: false });
});

test('the browser choice wins; choices for other fields are ignored', () => {
  expect(
    columnVisibility([column('f_name', true), column('f_phone', false)], {
      f_name: false,
      f_phone: true,
      f_gone: true,
    }),
  ).toEqual({ f_name: false, f_phone: true });
});

test('damaged storage values are ignored', () => {
  for (const raw of [null, '', 'not json', '[1]', 'null', '"x"']) {
    expect(parseColumnChoices(raw)).toEqual({});
  }
  const parsed = parseColumnChoices(
    '{"f_a":true,"f_b":"yes","__proto__":false,"constructor":true}',
  );
  expect(parsed).toEqual({ f_a: true });
  expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
});
