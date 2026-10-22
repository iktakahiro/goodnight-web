import { describe, expect, test } from 'bun:test';
import { resolveOptions } from './options.ts';

describe('resolveOptions', () => {
  test('accepts plain category values', () => {
    const { contact } = resolveOptions({
      contact: { categories: ['sales', 'press'] },
    });
    expect(contact.categories).toEqual(['sales', 'press']);
    expect(contact.categoryLabels).toEqual([
      { value: 'sales', label: null },
      { value: 'press', label: null },
    ]);
  });

  test('accepts labeled categories and keeps the order', () => {
    const { contact } = resolveOptions({
      contact: {
        categories: [
          { value: 'press', label: { ja: '取材', en: 'Press' } },
          'other',
        ],
      },
    });
    expect(contact.categories).toEqual(['press', 'other']);
    expect(contact.categoryLabels).toEqual([
      { value: 'press', label: { ja: '取材', en: 'Press' } },
      { value: 'other', label: null },
    ]);
  });

  test('accepts any category when none are configured', () => {
    const { contact } = resolveOptions();
    expect(contact.categories).toBeUndefined();
    expect(contact.categoryLabels).toEqual([]);
  });
});
