import { describe, expect, test } from 'bun:test';
import { CSV_BOM, csvCell, csvLine } from './csv.ts';

describe('csvCell', () => {
  test.each([
    ['=1+1', `"'=1+1"`],
    ['+81 3', `"'+81 3"`],
    ['-5', `"'-5"`],
    ['@SUM(A1)', `"'@SUM(A1)"`],
    ['\tcmd', `"'\tcmd"`],
    ['\rcmd', `"'\rcmd"`],
    [' =1+1', `"' =1+1"`],
    ['\n=1+1', `"'\n=1+1"`],
    ['\r\n@SUM(A1)', `"'\r\n@SUM(A1)"`],
    ['  -5', `"'  -5"`],
    ['\u3000+1', `"'\u3000+1"`],
    ['\u00a0=1', `"'\u00a0=1"`],
    ['\u0000=1', `"'\u0000=1"`],
    ['\uff1d1+1', `"'\uff1d1+1"`],
    ['\uff0b81 3', `"'\uff0b81 3"`],
    ['\uff0d5', `"'\uff0d5"`],
    ['\uff20SUM(A1)', `"'\uff20SUM(A1)"`],
    ['\u3000\uff1d1', `"'\u3000\uff1d1"`],
    ['\ufe661+1', `"'\ufe661+1"`],
    ['\u200b=1+1', `"'\u200b=1+1"`],
    ['\u200c\u200d+1', `"'\u200c\u200d+1"`],
    ['\u200e\u200f-1', `"'\u200e\u200f-1"`],
    ['\u2060@SUM(A1)', `"'\u2060@SUM(A1)"`],
    ['\ufeff=1', `"'\ufeff=1"`],
    ['\u202e=1', `"'\u202e=1"`],
    ['\u2066 \u2069=1', `"'\u2066 \u2069=1"`],
    ['\u200b plain', '"\u200b plain"'],
    ['\uff21\uff1d1', '"\uff21\uff1d1"'],
    [' plain', '" plain"'],
    ['a=b', '"a=b"'],
    ['plain', '"plain"'],
    ['a "b"', '"a ""b"""'],
    ['a,b\nc', '"a,b\nc"'],
  ])('escapes %j', (input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });

  test('keeps numbers and empty values', () => {
    expect(csvCell(-3)).toBe('"-3"');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
  });
});

test('csvLine ends with CRLF', () => {
  expect(csvLine(['a', null, 2])).toBe('"a","","2"\r\n');
  expect(CSV_BOM).toBe('\uFEFF');
});
