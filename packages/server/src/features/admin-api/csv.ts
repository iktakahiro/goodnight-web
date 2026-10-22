// Spreadsheet apps run a cell as a formula when it starts with one of
// `= + - @`, also after leading spaces or line breaks, or when it starts with
// a tab or carriage return.
// oxlint-disable-next-line no-control-regex
const FORMULA_START = /^(?:[\t\r]|[\s\u0000-\u001f\u007f]*[=+\-@])/;

/**
 * Formats one CSV cell (RFC 4180): always quoted, with inner quotes doubled.
 *
 * A string whose first non-whitespace character is `=`, `+`, `-`, or `@`, or
 * that starts with a tab or carriage return, gets a leading `'`, so
 * spreadsheet apps show it as text instead of running it as a formula (CSV
 * injection).
 */
export const csvCell = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) return '""';
  let text = String(value);
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`;
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
