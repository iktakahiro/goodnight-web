import { describe, expect, test } from 'bun:test';
import {
  FIELD_ID_PATTERN,
  FORM_LIMITS,
  fieldMaxLength,
  formFieldInputSchema,
  formUpdateSchema,
  isFieldId,
  localizedText,
  newFieldId,
  newOptionValue,
  OPTION_VALUE_PATTERN,
  valueShape,
  type FormField,
} from './form-definition.ts';

const label = { ja: '名前', en: 'Name' };

const textField = (overrides: Record<string, unknown> = {}) => ({
  type: 'text',
  label,
  required: true,
  showInList: true,
  ...overrides,
});

const selectField = (options: unknown[], overrides = {}) => ({
  type: 'select',
  label,
  required: false,
  options,
  ...overrides,
});

const option = (en: string, value?: string) => ({
  ...(value ? { value } : {}),
  label: { ja: en, en },
});

const update = (fields: unknown[]) =>
  formUpdateSchema.safeParse({ baseVersion: 1, fields });

describe('field ids', () => {
  test.each([
    'email',
    'consent',
    'website',
    '__proto__',
    'constructor',
    'prototype',
    'toString',
    "f_x'); drop table submissions; --",
    'f_X',
    'f_',
    'f-name',
    'f_name ',
    ' f_name',
    'f_na.me',
    '$.f_name',
    'f_name"',
    "f_name'",
    'f_name\n',
    `f_${'a'.repeat(33)}`,
    '',
  ])('%p is not a field id', (id) => {
    expect(FIELD_ID_PATTERN.test(id)).toBe(false);
    expect(isFieldId(id)).toBe(false);
    expect(formFieldInputSchema.safeParse(textField({ id })).success).toBe(
      false,
    );
  });

  test.each(['f_name', 'f_0', `f_${'a'.repeat(32)}`])(
    '%p is a field id',
    (id) => {
      expect(isFieldId(id)).toBe(true);
    },
  );

  test('non-strings are not field ids', () => {
    for (const value of [null, undefined, 1, {}, ['f_a']]) {
      expect(isFieldId(value)).toBe(false);
    }
  });

  test('generated ids and option values match their patterns and differ', () => {
    const ids = new Set(Array.from({ length: 200 }, newFieldId));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(isFieldId(id)).toBe(true);
    for (let i = 0; i < 50; i++) {
      expect(OPTION_VALUE_PATTERN.test(newOptionValue())).toBe(true);
    }
  });
});

describe('formFieldInputSchema', () => {
  test('accepts a minimal text field and fills showInList', () => {
    const parsed = formFieldInputSchema.parse(
      textField({ showInList: undefined }),
    );
    expect(parsed).toMatchObject({ type: 'text', showInList: false });
    expect(parsed.id).toBeUndefined();
  });

  test('rejects unknown properties', () => {
    expect(
      formFieldInputSchema.safeParse(textField({ key: 'name' })).success,
    ).toBe(false);
    expect(
      formFieldInputSchema.safeParse(
        textField({ label: { ...label, fr: 'x' } }),
      ).success,
    ).toBe(false);
    expect(
      formFieldInputSchema.safeParse(
        selectField([{ ...option('A'), extra: 1 }]),
      ).success,
    ).toBe(false);
  });

  test('rejects unknown types', () => {
    for (const type of ['email', 'file', 'hidden', 'password', 'TEXT']) {
      expect(formFieldInputSchema.safeParse(textField({ type })).success).toBe(
        false,
      );
    }
  });

  test('a label needs Japanese or English', () => {
    expect(
      formFieldInputSchema.safeParse(textField({ label: { ja: '', en: '' } }))
        .success,
    ).toBe(false);
    expect(
      formFieldInputSchema.safeParse(
        textField({ label: { ja: ' \u0000 ', en: '' } }),
      ).success,
    ).toBe(false);
    expect(
      formFieldInputSchema.safeParse(
        textField({ label: { ja: '', en: 'Name' } }),
      ).success,
    ).toBe(true);
  });

  test('cleans control characters in labels and drops empty texts', () => {
    const parsed = formFieldInputSchema.parse(
      textField({
        label: { ja: ' 名\u0000前  ', en: 'Name\r\n' },
        placeholder: { ja: '', en: '  ' },
        hint: { ja: 'ヒント', en: '' },
      }),
    );
    expect(parsed.label).toEqual({ ja: '名 前', en: 'Name' });
    expect(parsed.placeholder).toBeUndefined();
    expect(parsed.hint).toEqual({ ja: 'ヒント', en: '' });
  });

  test('limits label, placeholder, and hint lengths', () => {
    const long = (n: number) => ({ ja: 'あ'.repeat(n), en: '' });
    expect(
      formFieldInputSchema.safeParse(
        textField({ label: long(FORM_LIMITS.label) }),
      ).success,
    ).toBe(true);
    expect(
      formFieldInputSchema.safeParse(
        textField({ label: long(FORM_LIMITS.label + 1) }),
      ).success,
    ).toBe(false);
    expect(
      formFieldInputSchema.safeParse(
        textField({ placeholder: long(FORM_LIMITS.placeholder + 1) }),
      ).success,
    ).toBe(false);
    expect(
      formFieldInputSchema.safeParse(
        textField({ hint: long(FORM_LIMITS.hint + 1) }),
      ).success,
    ).toBe(false);
  });

  test('maxLength is at most 2000, or 10000 for a text area', () => {
    const ok = (type: string, maxLength: number) =>
      formFieldInputSchema.safeParse(textField({ type, maxLength })).success;
    expect(ok('text', 2000)).toBe(true);
    expect(ok('text', 2001)).toBe(false);
    expect(ok('tel', 2001)).toBe(false);
    expect(ok('url', 2001)).toBe(false);
    expect(ok('textarea', 10_000)).toBe(true);
    expect(ok('textarea', 10_001)).toBe(false);
    expect(ok('text', 0)).toBe(false);
    expect(ok('text', 1.5)).toBe(false);
  });

  test('maxLength is dropped for types without text', () => {
    const parsed = formFieldInputSchema.parse(
      textField({ type: 'date', maxLength: 50 }),
    );
    expect(parsed.maxLength).toBeUndefined();
  });

  test('choice types need options; other types drop them', () => {
    for (const type of ['select', 'radio', 'checkbox']) {
      expect(
        formFieldInputSchema.safeParse(selectField([], { type })).success,
      ).toBe(false);
      expect(
        formFieldInputSchema.safeParse(
          selectField([option('A')], { options: undefined, type }),
        ).success,
      ).toBe(false);
      expect(
        formFieldInputSchema.safeParse(selectField([option('A')], { type }))
          .success,
      ).toBe(true);
    }
    const text = formFieldInputSchema.parse(
      textField({ options: [option('A')] }),
    );
    expect(text.options).toBeUndefined();
  });

  test('at most 50 options with unique values', () => {
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => option(`O${i}`));
    expect(formFieldInputSchema.safeParse(selectField(many(50))).success).toBe(
      true,
    );
    expect(formFieldInputSchema.safeParse(selectField(many(51))).success).toBe(
      false,
    );
    expect(
      formFieldInputSchema.safeParse(
        selectField([option('A', 'same'), option('B', 'same')]),
      ).success,
    ).toBe(false);
  });

  test.each(['Sales', 'a b', "a'", '_a', 'a'.repeat(65), '__proto__', ''])(
    'option value %p is rejected',
    (value) => {
      expect(
        formFieldInputSchema.safeParse(
          selectField([{ value, label: { ja: 'A', en: 'A' } }]),
        ).success,
      ).toBe(false);
    },
  );
});

describe('formUpdateSchema', () => {
  test('accepts up to 30 fields', () => {
    const fields = (n: number) => Array.from({ length: n }, () => textField());
    expect(update(fields(0)).success).toBe(true);
    expect(update(fields(FORM_LIMITS.fields)).success).toBe(true);
    expect(update(fields(FORM_LIMITS.fields + 1)).success).toBe(false);
  });

  test('rejects duplicate ids', () => {
    expect(
      update([textField({ id: 'f_a' }), textField({ id: 'f_a' })]).success,
    ).toBe(false);
    expect(
      update([textField({ id: 'f_a' }), textField({ id: 'f_b' })]).success,
    ).toBe(true);
  });

  test('needs a positive integer baseVersion and nothing else', () => {
    expect(formUpdateSchema.safeParse({ fields: [] }).success).toBe(false);
    expect(
      formUpdateSchema.safeParse({ baseVersion: 0, fields: [] }).success,
    ).toBe(false);
    expect(
      formUpdateSchema.safeParse({ baseVersion: 1, fields: [], extra: 1 })
        .success,
    ).toBe(false);
  });
});

describe('helpers', () => {
  test('localizedText falls back to the other language', () => {
    expect(localizedText({ ja: '名前', en: 'Name' }, 'en')).toBe('Name');
    expect(localizedText({ ja: '名前', en: '' }, 'en')).toBe('名前');
    expect(localizedText({ ja: '', en: 'Name' }, 'ja')).toBe('Name');
  });

  test('fieldMaxLength applies the defaults', () => {
    const field = (type: FormField['type'], maxLength?: number): FormField => ({
      id: 'f_a',
      type,
      label,
      required: false,
      showInList: false,
      ...(maxLength ? { maxLength } : {}),
    });
    expect(fieldMaxLength(field('text'))).toBe(200);
    expect(fieldMaxLength(field('textarea'))).toBe(5000);
    expect(fieldMaxLength(field('tel'))).toBe(40);
    expect(fieldMaxLength(field('url'))).toBe(2000);
    expect(fieldMaxLength(field('text', 30))).toBe(30);
    expect(fieldMaxLength(field('number'))).toBe(0);
  });

  test('valueShape groups types that store the same shape', () => {
    expect(
      ['text', 'textarea', 'tel', 'url'].map((t) => valueShape(t as never)),
    ).toEqual(['text', 'text', 'text', 'text']);
    expect(valueShape('select')).toBe(valueShape('radio'));
    expect(valueShape('checkbox')).not.toBe(valueShape('select'));
    expect(valueShape('number')).not.toBe(valueShape('text'));
    expect(valueShape('date')).not.toBe(valueShape('text'));
  });
});
