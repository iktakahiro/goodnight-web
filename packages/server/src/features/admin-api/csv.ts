// Spreadsheet apps run a cell as a formula when it starts with one of
// `= + - @`, also after leading spaces or line breaks, or when it starts with
// a tab or carriage return. Invisible format characters (zero-width spaces,
// bidi controls, the BOM) are skipped like whitespace, and the test runs on
// the NFKC form, so full-width `＝＋－＠` count as well.
// oxlint-disable-next-line no-control-regex
const FORMULA_START = /^(?:[\t\r]|[\s\p{Cc}\p{Cf}]*[=+\-@])/u;

/**
 * Formats one CSV cell (RFC 4180): always quoted, with inner quotes doubled.
 *
 * A string whose first visible character is `=`, `+`, `-`, or `@` (also in
 * full-width or any other form that NFKC maps to them), or that starts with
 * a tab or carriage return, gets a leading `'`, so spreadsheet apps show it
 * as text instead of running it as a formula (CSV injection). Whitespace,
 * control characters, and Unicode format characters (`\p{Cf}`, such as
 * U+200B and U+202E) before it are skipped. The cell keeps the original
 * text; NFKC is used only for the test.
 */
export const csvCell = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) return '""';
  let text = String(value);
  if (typeof value === 'string' && FORMULA_START.test(text.normalize('NFKC'))) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
};

/** One CSV line with a CRLF line ending. */
export const csvLine = (
  row: readonly (string | number | null | undefined)[],
): string => `${row.map(csvCell).join(',')}\r\n`;

/**
 * UTF-8 byte order mark that starts a CSV file, so spreadsheet apps read
 * Japanese text correctly.
 */
export const CSV_BOM = '\uFEFF';
