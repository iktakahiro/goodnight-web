import { expect, test } from 'bun:test';
import { messages } from '../../../../src/shared/messages.ts';
import { interpolate } from './i18n-provider.tsx';
import { isUiMessageKey, uiMessages } from './admin-messages.ts';

test('ja and en define the same non-empty keys', () => {
  expect(Object.keys(uiMessages.ja).sort()).toEqual(
    Object.keys(uiMessages.en).sort(),
  );
  for (const catalog of Object.values(uiMessages)) {
    for (const value of Object.values(catalog)) {
      expect(value.trim()).not.toBe('');
    }
  }
});

test('admin-only strings do not override the shared catalog', () => {
  const shared = Object.keys(messages.en).length;
  const merged = Object.keys(uiMessages.en).length;
  for (const locale of ['ja', 'en'] as const) {
    for (const [key, value] of Object.entries(messages[locale])) {
      expect(uiMessages[locale][key as keyof typeof uiMessages.en]).toBe(value);
    }
  }
  expect(merged).toBeGreaterThan(shared);
});

test('placeholders are the same in both languages', () => {
  const names = (text: string) =>
    [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const key of Object.keys(
    uiMessages.en,
  ) as (keyof typeof uiMessages.en)[]) {
    expect(names(uiMessages.ja[key])).toEqual(names(uiMessages.en[key]));
  }
});

test('API error codes map to shared messages', () => {
  expect(isUiMessageKey('error.invalid_setup_token')).toBe(true);
  expect(isUiMessageKey('error.something_new')).toBe(false);
  expect(isUiMessageKey('toString')).toBe(false);
});

test('interpolate fills known placeholders and keeps unknown ones', () => {
  expect(interpolate('{count} unread', { count: 3 })).toBe('3 unread');
  expect(interpolate('{a} and {b}', { a: 'x' })).toBe('x and {b}');
});
