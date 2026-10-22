// Spreadsheet apps run a cell that starts with one of these as a formula.
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * Formats one CSV cell (RFC 4180): always quoted, with inner quotes doubled.
 *
 * A value that starts with `=`, `+`, `-`, `@`, tab, or carriage return gets a
 * leading `'`, so spreadsheet apps show it as text instead of running it as a
 * formula (CSV injection).
 */
export const csvCell = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) return '""';
  let text = String(value);
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

/**
 * Builds a CSV document with CRLF line endings and a UTF-8 byte order mark,
 * so spreadsheet apps read Japanese text correctly.
 */
export const toCsv = (
  header: readonly string[],
  rows: readonly (readonly (string | number | null | undefined)[])[],
): string =>
  '\uFEFF' +
  [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') +
  '\r\n';
