import { describe, expect, test } from 'bun:test';
import { messages, pickLocale, translate } from './messages.ts';

test('ja and en define the same non-empty keys', () => {
  expect(Object.keys(messages.ja).sort()).toEqual(
    Object.keys(messages.en).sort(),
  );
  for (const catalog of Object.values(messages)) {
    for (const value of Object.values(catalog))
      expect(value.trim()).not.toBe('');
  }
});

test('translate fills placeholders', () => {
  expect(translate('en', 'admin.unreadCount', { count: 3 })).toBe('3 unread');
  expect(translate('ja', 'admin.unreadCount', { count: 3 })).toBe('未読 3 件');
});

describe('pickLocale', () => {
  test.each([
    ['ja-JP,ja;q=0.9,en;q=0.8', 'ja'],
    ['en-US,en;q=0.9,ja;q=0.8', 'en'],
    ['fr-FR,ja;q=0.5', 'ja'],
    ['fr-FR', 'en'],
    ['en;q=0.1,ja;q=0.9', 'ja'],
    ['ja;q=0,en', 'en'],
  ])('%s -> %s', (header, expected) => {
    expect(pickLocale(header)).toBe(expected as 'ja' | 'en');
  });

  test('uses the fallback without a header', () => {
    expect(pickLocale(null, 'ja')).toBe('ja');
  });
});
