import { expect, test } from 'bun:test';
import { detectLocale, isLocale } from './locale.ts';

test('a saved choice wins over the browser languages', () => {
  expect(detectLocale('en', ['ja-JP', 'ja'])).toBe('en');
  expect(detectLocale('ja', ['en-US'])).toBe('ja');
});

test('ignores a saved value that is not a supported locale', () => {
  expect(detectLocale('fr', ['ja-JP'])).toBe('ja');
  expect(detectLocale('', ['en-GB'])).toBe('en');
});

test('takes the first supported browser language in order', () => {
  expect(detectLocale(null, ['ja-JP', 'en-US'])).toBe('ja');
  expect(detectLocale(null, ['en-US', 'ja'])).toBe('en');
  expect(detectLocale(null, ['fr-FR', 'ja-JP', 'en'])).toBe('ja');
});

test('falls back to English', () => {
  expect(detectLocale(null, ['fr-FR', 'de'])).toBe('en');
  expect(detectLocale(undefined, [])).toBe('en');
});

test('isLocale narrows only ja and en', () => {
  expect(isLocale('ja')).toBe(true);
  expect(isLocale('en')).toBe(true);
  expect(isLocale('EN')).toBe(false);
  expect(isLocale(null)).toBe(false);
});
