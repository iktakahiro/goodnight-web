import { describe, expect, test } from 'bun:test';
import { buildFieldValuesSchema } from '../contact-form/form-values-schema.ts';
import { contactFieldErrors, contactRequestSchema } from './contact-schema.ts';

const base = {
  email: 'taro@example.org',
  consent: true,
  fields: {},
  turnstileToken: 't',
};

describe('contactRequestSchema', () => {
  test('cleans the email address', () => {
    expect(
      contactRequestSchema.parse({ ...base, email: ' taro@example.org\u0000 ' })
        .email,
    ).toBe('taro@example.org');
  });

  test('requires a Turnstile token and validates pagePath', () => {
    const { turnstileToken: _token, ...noToken } = base;
    expect(contactRequestSchema.safeParse(noToken).success).toBe(false);
    const ok = { ...base, pagePath: '/ja/contact' };
    expect(contactRequestSchema.safeParse(ok).success).toBe(true);
    expect(
      contactRequestSchema.safeParse({ ...ok, pagePath: 'https://x.example' })
        .success,
    ).toBe(false);
  });

  test('requires fields to be an object', () => {
    for (const fields of [null, [], 'x', 1]) {
      expect(contactRequestSchema.safeParse({ ...base, fields }).success).toBe(
        false,
      );
    }
  });

  test('keeps the fields object as parsed, with own __proto__ keys', () => {
    const input = JSON.parse(
      '{"email":"a@example.org","consent":true,"turnstileToken":"t","fields":{"__proto__":{"x":1}}}',
    );
    const parsed = contactRequestSchema.parse(input);
    expect(Object.keys(parsed.fields)).toEqual(['__proto__']);
  });

  test('accepts only ja and en as locale', () => {
    expect(
      contactRequestSchema.safeParse({ ...base, locale: 'ja' }).success,
    ).toBe(true);
    expect(
      contactRequestSchema.safeParse({ ...base, locale: 'fr' }).success,
    ).toBe(false);
  });
});

describe('contactFieldErrors', () => {
  test('codes fixed fields by name', () => {
    const input = { ...base, email: 'not-an-email', consent: false };
    const result = contactRequestSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(contactFieldErrors(result.error, input)).toEqual({
        email: 'invalid',
        consent: 'required',
      });
    }
  });

  test('codes form fields by id, and unknown keys as fields', () => {
    const schema = buildFieldValuesSchema([
      {
        id: 'f_name',
        type: 'text',
        label: { ja: '名前', en: 'Name' },
        required: true,
        maxLength: 5,
        showInList: true,
      },
      {
        id: 'f_note',
        type: 'text',
        label: { ja: 'メモ', en: 'Note' },
        required: false,
        maxLength: 5,
        showInList: false,
      },
    ]);
    const missing = { ...base, fields: { f_note: 'toolong' } };
    const first = schema.safeParse(missing.fields);
    expect(first.success).toBe(false);
    if (!first.success) {
      expect(contactFieldErrors(first.error, missing, 'fields')).toEqual({
        f_name: 'required',
        f_note: 'too_long',
      });
    }
    const unknown = { ...base, fields: { f_name: 'a', f_other: 'x' } };
    const second = schema.safeParse(unknown.fields);
    expect(second.success).toBe(false);
    if (!second.success) {
      expect(contactFieldErrors(second.error, unknown, 'fields')).toEqual({
        fields: 'invalid',
      });
    }
  });
});
