import { describe, expect, test } from 'bun:test';
import {
  contactFieldErrors,
  contactFieldsSchema,
  contactRequestSchema,
} from './contact-schema.ts';

const base = {
  name: 'Taro',
  email: 'taro@example.org',
  message: 'Hello',
  consent: true as const,
};

describe('contactFieldsSchema', () => {
  test('removes control characters and trims', () => {
    const result = contactFieldsSchema.parse({
      ...base,
      name: ' Ta\u0000ro\u202E ',
      company: '\u0007',
      message: ' line1\r\nline2\u0008\tend \u2028',
    });
    expect(result.name).toBe('Ta ro\u202E');
    expect(result.company).toBeUndefined();
    expect(result.message).toBe('line1\nline2\tend');
  });

  test('accepts full-width digits in phone', () => {
    expect(
      contactFieldsSchema.parse({ ...base, phone: '０３－１２３４' }).phone,
    ).toBe('03-1234');
    expect(
      contactFieldsSchema.safeParse({ ...base, phone: 'call me' }).success,
    ).toBe(false);
  });

  test('enforces length limits', () => {
    const result = contactFieldsSchema.safeParse({
      ...base,
      message: 'a'.repeat(5001),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(contactFieldErrors(result.error, base)).toEqual({
        message: 'too_long',
      });
    }
  });

  test('requires consent', () => {
    const input = { ...base, consent: false };
    const result = contactFieldsSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(contactFieldErrors(result.error, input)).toEqual({
        consent: 'required',
      });
    }
  });
});

describe('contactRequestSchema', () => {
  test('requires a Turnstile token and validates pagePath', () => {
    expect(contactRequestSchema.safeParse(base).success).toBe(false);
    const ok = { ...base, turnstileToken: 't', pagePath: '/ja/contact' };
    expect(contactRequestSchema.safeParse(ok).success).toBe(true);
    expect(
      contactRequestSchema.safeParse({ ...ok, pagePath: 'https://x.example' })
        .success,
    ).toBe(false);
  });
});
