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
