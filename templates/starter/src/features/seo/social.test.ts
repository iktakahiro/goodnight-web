import { expect, test } from 'bun:test';
import { ogLocale } from './social';

test('formats locale tags for Open Graph', () => {
  expect(ogLocale('ja-JP')).toBe('ja_JP');
  expect(ogLocale('en-US')).toBe('en_US');
});
