import { describe, expect, test } from 'bun:test';
import {
  ADMIN_MAX_PAGE,
  ADMIN_MAX_PAGE_SIZE,
  ADMIN_PAGE_SIZE,
  exportQuerySchema,
  listQuerySchema,
} from './admin-query.ts';

const list = (query: Record<string, string>) =>
  listQuerySchema.safeParse(query);
const exported = (query: Record<string, string>) =>
  exportQuerySchema.safeParse(query);

describe('listQuerySchema defaults', () => {
  test('an empty query gets every default', () => {
    expect(list({})).toMatchObject({
      success: true,
      data: { view: 'all', dir: 'desc', page: 1, limit: ADMIN_PAGE_SIZE },
    });
  });

  test('the optional filters stay undefined', () => {
    const result = list({});
    expect(result.success && result.data.q).toBeUndefined();
    expect(result.success && result.data.version).toBeUndefined();
    expect(result.success && result.data.field).toBeUndefined();
    expect(result.success && result.data.value).toBeUndefined();
  });

  test('the page size constants are consistent', () => {
    expect(ADMIN_PAGE_SIZE).toBeLessThanOrEqual(ADMIN_MAX_PAGE_SIZE);
  });
});

describe('listQuerySchema paging', () => {
  test.each([
    ['page', '1', 1],
    ['page', '2', 2],
    ['page', String(ADMIN_MAX_PAGE), ADMIN_MAX_PAGE],
    ['limit', '1', 1],
    ['limit', '25', 25],
    ['limit', String(ADMIN_MAX_PAGE_SIZE), ADMIN_MAX_PAGE_SIZE],
  ])('%s=%s parses to the number %d', (key, value, expected) => {
    const result = list({ [key]: value });
    expect(result.success && result.data[key as 'page' | 'limit']).toBe(
      expected,
    );
  });

  test.each([
    ['page', String(ADMIN_MAX_PAGE + 1)],
    ['page', '999999'],
    ['page', '01'],
    ['page', '00'],
    ['page', '1_000'],
    ['page', '1,000'],
    ['page', '١'], // Arabic-Indic digit one
    ['page', '１'], // full-width digit one
    ['page', '1\n'],
    ['page', '\t1'],
    ['limit', String(ADMIN_MAX_PAGE_SIZE + 1)],
    ['limit', '1000'],
    ['limit', '00'],
    ['limit', '05'],
    ['limit', '-0'],
    ['limit', '1 0'],
    ['limit', '５'],
    ['limit', '1\u0000'],
    ['limit', 'true'],
    ['limit', 'null'],
    ['limit', '[]'],
    ['limit', '{}'],
  ])('%s=%p is rejected', (key, value) => {
    expect(list({ [key]: value }).success).toBe(false);
  });

  test('a very long digit string is rejected by length', () => {
    expect(list({ page: '9'.repeat(10_000) }).success).toBe(false);
  });
});

describe('listQuerySchema dir', () => {
  test.each(['asc', 'desc'])('accepts %s', (dir) => {
    const result = list({ dir });
    expect(result.success && result.data.dir).toBe(dir);
  });

  test.each(['', 'ASC', 'Desc', ' asc', 'asc ', 'ascending', '1'])(
    'rejects %p',
    (dir) => {
      expect(list({ dir }).success).toBe(false);
    },
  );
});

describe('view', () => {
  test.each(['unread', 'read', 'all', 'spam'])('accepts %s', (view) => {
    const result = list({ view });
    expect(result.success && result.data.view).toBe(view);
  });

  test('an empty view means the default view', () => {
    const result = list({ view: '' });
    expect(result.success && result.data.view).toBe('all');
    const csv = exported({ view: '' });
    expect(csv.success && csv.data.view).toBe('all');
  });

  test.each([
    'UNREAD',
    'Spam',
    ' read',
    'read ',
    'held',
    'suspected',
    'all,spam',
  ])('rejects %p', (view) => {
    expect(list({ view }).success).toBe(false);
    expect(exported({ view }).success).toBe(false);
  });
});

describe('q', () => {
  test('is trimmed', () => {
    const result = list({ q: '  taro@example.com \t' });
    expect(result.success && result.data.q).toBe('taro@example.com');
  });

  test.each(['', ' ', '   ', '\t\n'])('%p means no search', (q) => {
    const result = list({ q });
    expect(result.success).toBe(true);
    expect(result.success && result.data.q).toBeUndefined();
  });

  test('keeps characters that LIKE treats specially for the store to escape', () => {
    const result = list({ q: '100%_\\' });
    expect(result.success && result.data.q).toBe('100%_\\');
  });

  test('accepts 254 characters and rejects 255', () => {
    expect(list({ q: 'a'.repeat(254) }).success).toBe(true);
    expect(list({ q: 'a'.repeat(255) }).success).toBe(false);
  });

  test('counts the length before trimming', () => {
    expect(list({ q: `${'a'.repeat(254)} ` }).success).toBe(false);
  });

  test('applies to the export as well', () => {
    const result = exported({ q: ' Taro ' });
    expect(result.success && result.data.q).toBe('Taro');
    expect(exported({ q: 'a'.repeat(255) }).success).toBe(false);
  });
});

describe('version', () => {
  test.each([
    ['1', 1],
    ['12', 12],
    ['1000000', 1_000_000],
  ])('accepts %s', (version, expected) => {
    const result = list({ version });
    expect(result.success && result.data.version).toBe(expected);
  });

  test.each(['', '0', '-1', '01', '1000001', '9999999', '1.0', '1e3', 'x'])(
    'rejects %p',
    (version) => {
      expect(list({ version }).success).toBe(false);
      expect(exported({ version }).success).toBe(false);
    },
  );
});

describe('field and value', () => {
  test('accepts both together', () => {
    const result = list({ field: 'f_category', value: 'sales-team_2' });
    expect(result).toMatchObject({
      success: true,
      data: { field: 'f_category', value: 'sales-team_2' },
    });
  });

  test('rejects one without the other, in the list and the export', () => {
    const queries: Record<string, string>[] = [
      { field: 'f_category' },
      { value: 'sales' },
    ];
    for (const query of queries) {
      expect(list(query).success).toBe(false);
      expect(exported(query).success).toBe(false);
    }
  });

  test('an empty value is not the same as a missing one', () => {
    expect(list({ field: 'f_category', value: '' }).success).toBe(false);
    expect(list({ field: '', value: 'sales' }).success).toBe(false);
    expect(list({ field: '', value: '' }).success).toBe(false);
  });

  test.each([
    'category',
    'F_category',
    'f_',
    'f_Category',
    'f_a-b',
    `f_${'a'.repeat(33)}`,
    "f_a' OR '1'='1",
    'f_a b',
    'f_a\n',
  ])('rejects the field id %p', (field) => {
    expect(list({ field, value: 'sales' }).success).toBe(false);
  });

  test('accepts the longest field id', () => {
    expect(list({ field: `f_${'a'.repeat(32)}`, value: 'x' }).success).toBe(
      true,
    );
  });

  test.each([
    'Sales',
    '-sales',
    '_sales',
    'a b',
    'a.b',
    'a%',
    'a'.repeat(65),
    "x' OR '1'='1",
    'x\n',
  ])('rejects the option value %p', (value) => {
    expect(list({ field: 'f_category', value }).success).toBe(false);
  });

  test('accepts the longest option value', () => {
    expect(list({ field: 'f_category', value: 'a'.repeat(64) }).success).toBe(
      true,
    );
  });
});

describe('unknown parameters', () => {
  test.each([
    'sort',
    'status',
    'search',
    'keyword',
    'offset',
    'orderBy',
    'Page',
    'PAGE',
    'page ',
    '__proto__',
    'constructor',
    '',
  ])('rejects %p in the list', (key) => {
    expect(list({ [key]: '1' }).success).toBe(false);
  });

  test('rejects an unknown parameter next to valid ones', () => {
    expect(list({ view: 'read', page: '2', extra: '1' }).success).toBe(false);
  });

  test('the export rejects the list-only parameters', () => {
    for (const key of ['dir', 'page', 'limit']) {
      expect(exported({ [key]: key === 'dir' ? 'asc' : '1' }).success).toBe(
        false,
      );
    }
  });

  test('the list rejects lang', () => {
    expect(list({ lang: 'en' }).success).toBe(false);
  });
});

describe('exportQuerySchema', () => {
  test('an empty query is valid and sets no lang', () => {
    const result = exported({});
    expect(result.success).toBe(true);
    expect(result.success && result.data.lang).toBeUndefined();
    expect(result.success && result.data.view).toBe('all');
  });

  test.each(['ja', 'en'])('accepts lang=%s', (lang) => {
    const result = exported({ lang });
    expect(result.success && result.data.lang).toBe(lang);
  });

  test.each(['', 'fr', 'EN', 'ja-JP', 'en '])('rejects lang=%p', (lang) => {
    expect(exported({ lang }).success).toBe(false);
  });

  test('accepts every filter together', () => {
    expect(
      exported({
        view: 'spam',
        q: 'taro',
        version: '2',
        field: 'f_category',
        value: 'press',
        lang: 'ja',
      }),
    ).toMatchObject({
      success: true,
      data: {
        view: 'spam',
        q: 'taro',
        version: 2,
        field: 'f_category',
        value: 'press',
        lang: 'ja',
      },
    });
  });
});
