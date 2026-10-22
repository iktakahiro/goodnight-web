import { describe, expect, test } from 'bun:test';
import { csvCell, toCsv } from './csv.ts';

describe('csvCell', () => {
  test.each([
    ['=1+1', `"'=1+1"`],
    ['+81 3', `"'+81 3"`],
    ['-5', `"'-5"`],
    ['@SUM(A1)', `"'@SUM(A1)"`],
    ['\tcmd', `"'\tcmd"`],
    ['\rcmd', `"'\rcmd"`],
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

test('toCsv adds a BOM and CRLF line endings', () => {
  expect(toCsv(['a', 'b'], [['1', null]])).toBe('\uFEFF"a","b"\r\n"1",""\r\n');
});
