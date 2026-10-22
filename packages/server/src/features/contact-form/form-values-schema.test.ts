import { describe, expect, test } from 'bun:test';
import type { FormField } from './form-definition.ts';
import { buildFieldValuesSchema } from './form-values-schema.ts';

const field = (
  id: string,
  type: FormField['type'],
  extra: Partial<FormField> = {},
): FormField => ({
  id,
  type,
  label: { ja: id, en: id },
  required: false,
  showInList: false,
  ...extra,
});

const options = [
  { value: 'a', label: { ja: 'A', en: 'A' } },
  { value: 'b', label: { ja: 'B', en: 'B' } },
];

const schemaOf = (f: FormField) => buildFieldValuesSchema([f]);
const parse = (f: FormField, value: unknown) =>
  schemaOf(f).safeParse({ [f.id]: value });
const value = (f: FormField, input: unknown) => {
  const result = parse(f, input);
  if (!result.success) throw new Error(JSON.stringify(result.error.issues));
  return result.data[f.id];
};

describe('buildFieldValuesSchema', () => {
  test('text: removes control characters, trims, and checks length', () => {
    const f = field('f_t', 'text', { maxLength: 8 });
    expect(value(f, ' Ta\u0000ro‮ ')).toBe('Ta ro‮');
    expect(value(f, 'a\r\nb')).toBe('a  b');
    expect(parse(f, 'abcdefghi').success).toBe(false);
    expect(parse(f, 123).success).toBe(false);
  });

  test('text without maxLength uses the default', () => {
    const f = field('f_t', 'text');
    expect(parse(f, 'a'.repeat(200)).success).toBe(true);
    expect(parse(f, 'a'.repeat(201)).success).toBe(false);
  });

  test('textarea keeps line breaks and tabs', () => {
    const f = field('f_m', 'textarea');
    expect(value(f, ' line1\r\nline2\u0008\tend  ')).toBe('line1\nline2\tend');
    expect(parse(f, 'a'.repeat(5001)).success).toBe(false);
  });

  test('tel accepts full-width digits and rejects letters', () => {
    const f = field('f_p', 'tel');
    expect(value(f, '０３－１２３４')).toBe('03-1234');
    expect(parse(f, 'call me').success).toBe(false);
  });

  test('url accepts http and https only', () => {
    const f = field('f_u', 'url');
    expect(value(f, ' https://example.com/a ')).toBe('https://example.com/a');
    expect(value(f, 'http://example.com')).toBe('http://example.com');
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,x',
      'ftp://example.com',
      'example.com',
      'file:///etc/passwd',
    ]) {
      expect(parse(f, bad).success).toBe(false);
    }
  });

  test('number accepts numbers and numeric text', () => {
    const f = field('f_n', 'number');
    expect(value(f, 12)).toBe(12);
    expect(value(f, '-3.5')).toBe(-3.5);
    expect(value(f, '１２')).toBe(12);
    for (const bad of ['1e3', '0x10', 'abc', '1,000', Infinity, 1e16, '01']) {
      expect(parse(f, bad).success).toBe(false);
    }
  });

  test('date accepts real YYYY-MM-DD dates', () => {
    const f = field('f_d', 'date');
    expect(value(f, '2026-02-28')).toBe('2026-02-28');
    for (const bad of [
      '2026-02-30',
      '2026-13-01',
      '26-01-01',
      '2026/01/01',
      '1800-01-01',
    ]) {
      expect(parse(f, bad).success).toBe(false);
    }
  });

  test('select and radio accept one of their options', () => {
    for (const type of ['select', 'radio'] as const) {
      const f = field('f_s', type, { options });
      expect(value(f, 'a')).toBe('a');
      expect(parse(f, 'c').success).toBe(false);
      expect(parse(f, 'A').success).toBe(false);
      expect(parse(f, ['a']).success).toBe(false);
    }
  });

  test('checkbox accepts a list of distinct options', () => {
    const f = field('f_c', 'checkbox', { options });
    expect(value(f, ['b', 'a'])).toEqual(['b', 'a']);
    expect(parse(f, ['a', 'a']).success).toBe(false);
    expect(parse(f, ['a', 'c']).success).toBe(false);
    expect(parse(f, 'a').success).toBe(false);
  });

  test('required fields reject missing and empty values', () => {
    for (const [type, extra] of [
      ['text', {}],
      ['select', { options }],
      ['checkbox', { options }],
    ] as const) {
      const f = field('f_r', type, { required: true, ...extra });
      for (const empty of [undefined, null, '', '   ', []]) {
        const result = buildFieldValuesSchema([f]).safeParse(
          empty === undefined ? {} : { f_r: empty },
        );
        expect(result.success).toBe(false);
      }
    }
  });

  test('optional empty values are left out of the result', () => {
    const schema = buildFieldValuesSchema([
      field('f_a', 'text'),
      field('f_b', 'checkbox', { options }),
      field('f_c', 'number'),
      field('f_d', 'text'),
    ]);
    expect(schema.parse({ f_a: '  ', f_b: [], f_c: null, f_d: 'x' })).toEqual({
      f_d: 'x',
    });
    expect(Object.keys(schema.parse({}))).toEqual([]);
  });

  test('the result follows the definition order', () => {
    const schema = buildFieldValuesSchema([
      field('f_a', 'text'),
      field('f_b', 'text'),
    ]);
    expect(Object.keys(schema.parse({ f_b: 'b', f_a: 'a' }))).toEqual([
      'f_a',
      'f_b',
    ]);
  });

  test.each([
    '{"f_x":"1"}',
    '{"__proto__":{"polluted":true}}',
    '{"constructor":{"prototype":{"polluted":true}}}',
    '{"prototype":"x"}',
    '{"toString":"x"}',
    '{"email":"a@example.org"}',
  ])('rejects the unknown key in %s', (json) => {
    const schema = buildFieldValuesSchema([field('f_a', 'text')]);
    const result = schema.safeParse(JSON.parse(json));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.code).toBe('unrecognized_keys');
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  test('rejects values that are not objects', () => {
    const schema = buildFieldValuesSchema([field('f_a', 'text')]);
    for (const input of [null, [], 'x', 1, undefined]) {
      expect(schema.safeParse(input).success).toBe(false);
    }
  });

  test('an empty definition accepts only an empty object', () => {
    const schema = buildFieldValuesSchema([]);
    expect(schema.parse({})).toEqual({});
    expect(schema.safeParse({ f_a: 'x' }).success).toBe(false);
  });
});
