import { expect, test } from 'bun:test';
import { fieldValueText, labelText } from './field-value.ts';

test('text values are shown as they are', () => {
  expect(fieldValueText({ kind: 'text', text: 'Hello' }, 'ja')).toBe('Hello');
});

test('choices show their labels, falling back to the other language and the value', () => {
  const value = {
    kind: 'choices' as const,
    choices: [
      { value: 'press', label: { ja: '取材', en: 'Press' } },
      { value: 'other', label: { ja: '', en: 'Other' } },
      { value: 'o_gone', label: null },
    ],
  };
  expect(fieldValueText(value, 'ja')).toBe('取材、Other、o_gone');
  expect(fieldValueText(value, 'en')).toBe('Press, Other, o_gone');
});

test('labels fall back to the field id', () => {
  expect(labelText({ ja: 'お名前', en: 'Name' }, 'en', 'f_name')).toBe('Name');
  expect(labelText({ ja: 'お名前', en: '' }, 'en', 'f_name')).toBe('お名前');
  expect(labelText(null, 'ja', 'f_name')).toBe('f_name');
  expect(labelText({ ja: '', en: '' }, 'ja', 'f_x')).toBe('f_x');
});
