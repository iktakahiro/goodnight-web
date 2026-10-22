import { describe, expect, test } from 'bun:test';
import { categoryLabel } from './category-label.ts';

const categories = [
  { value: 'sales', label: { ja: '営業', en: 'Sales' } },
  { value: 'other', label: null },
];

describe('categoryLabel', () => {
  test('shows the label in the current language', () => {
    expect(categoryLabel('sales', categories, 'ja')).toBe('営業');
    expect(categoryLabel('sales', categories, 'en')).toBe('Sales');
  });

  test('falls back to the value without a label', () => {
    expect(categoryLabel('other', categories, 'ja')).toBe('other');
  });

  test('falls back to the value for an unknown category', () => {
    expect(categoryLabel('press', categories, 'ja')).toBe('press');
  });

  test('falls back to the value before the status loads', () => {
    expect(categoryLabel('sales', null, 'ja')).toBe('sales');
    expect(categoryLabel('sales', undefined, 'en')).toBe('sales');
  });

  test('falls back to the value when a label is empty', () => {
    const blank = [{ value: 'sales', label: { ja: '', en: 'Sales' } }];
    expect(categoryLabel('sales', blank, 'ja')).toBe('sales');
  });
});
