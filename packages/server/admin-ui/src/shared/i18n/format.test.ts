import { describe, expect, test } from 'bun:test';
import {
  formatDateTime,
  formatListDate,
  formatNumber,
  pageRange,
} from './format.ts';

// Newer ICU/CLDR versions use U+202F (narrow no-break space) before AM/PM and
// may join the date and time with " at " instead of ",". Normalize the spaces
// and accept both joiners so the tests do not depend on the ICU version.
const normalize = (text: string) => text.replace(/[\u202F\u00A0]/g, ' ');

// 2026-10-22 00:05 UTC = 09:05 in Tokyo.
const at = Date.UTC(2026, 9, 22, 0, 5);

describe('formatDateTime', () => {
  test('uses the given time zone and the locale', () => {
    expect(formatDateTime(at, 'ja', 'Asia/Tokyo')).toBe('2026/10/22 9:05');
    expect(normalize(formatDateTime(at, 'en', 'UTC'))).toMatch(
      /^Oct 22, 2026(,| at) 12:05 AM$/,
    );
  });
});

describe('formatListDate', () => {
  const now = Date.UTC(2026, 9, 22, 6, 0);

  test('shows only the time on the same day', () => {
    expect(formatListDate(at, 'ja', now, 'Asia/Tokyo')).toBe('9:05');
    expect(normalize(formatListDate(at, 'en', now, 'Asia/Tokyo'))).toBe(
      '9:05 AM',
    );
  });

  test('the day boundary follows the time zone', () => {
    // 23:30 UTC on Oct 21 is Oct 22 in Tokyo but Oct 21 in UTC.
    const late = Date.UTC(2026, 9, 21, 23, 30);
    expect(normalize(formatListDate(late, 'en', now, 'Asia/Tokyo'))).toBe(
      '8:30 AM',
    );
    expect(formatListDate(late, 'en', now, 'UTC')).toBe('Oct 21');
  });

  test('shows the month and day within the same year', () => {
    const march = Date.UTC(2026, 2, 3, 3, 0);
    expect(formatListDate(march, 'ja', now, 'Asia/Tokyo')).toBe('3/3');
    expect(formatListDate(march, 'en', now, 'Asia/Tokyo')).toBe('Mar 3');
  });

  test('shows the full date for another year', () => {
    const old = Date.UTC(2025, 11, 30, 3, 0);
    expect(formatListDate(old, 'ja', now, 'Asia/Tokyo')).toBe('2025/12/30');
    expect(formatListDate(old, 'en', now, 'Asia/Tokyo')).toBe('12/30/2025');
  });
});

test('formatNumber groups digits', () => {
  expect(formatNumber(1234, 'ja')).toBe('1,234');
  expect(formatNumber(1234, 'en')).toBe('1,234');
});

describe('pageRange', () => {
  test.each([
    [1, 50, 0, { from: 0, to: 0, pageCount: 1 }],
    [1, 50, 12, { from: 1, to: 12, pageCount: 1 }],
    [1, 50, 120, { from: 1, to: 50, pageCount: 3 }],
    [3, 50, 120, { from: 101, to: 120, pageCount: 3 }],
    [2, 50, 100, { from: 51, to: 100, pageCount: 2 }],
  ])('page %i of size %i with %i items', (page, size, total, expected) => {
    expect(pageRange(page, size, total)).toEqual(expected);
  });
});
