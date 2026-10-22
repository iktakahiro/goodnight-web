import { expect, test } from 'bun:test';
import { DrizzleQueryError } from 'drizzle-orm';
import { redactQueryText, safeErrorMessage } from './log-error.ts';

const queryError = () =>
  new DrizzleQueryError(
    'insert into "user" ("email") values (?)',
    ['admin@example.com'],
    new Error('D1_ERROR: no such table: user: SQLITE_ERROR'),
  );

test('keeps only the database message of a query error', () => {
  expect(safeErrorMessage(queryError())).toBe(
    'D1_ERROR: no such table: user: SQLITE_ERROR',
  );
});

test('finds a query error wrapped in another error', () => {
  const inner = queryError();
  const wrapped = new Error(`adapter failed: ${inner.message}`, {
    cause: new Error('step failed', { cause: inner }),
  });
  expect(safeErrorMessage(wrapped)).toBe(
    'D1_ERROR: no such table: user: SQLITE_ERROR',
  );
});

test('redacts query text that another error copied into its message', () => {
  const copied = new Error(`create failed: ${queryError().message}`);
  const message = safeErrorMessage(copied);
  expect(message).toBe('create failed: Failed query: [redacted]');
  expect(redactQueryText(queryError().message)).not.toContain('admin@');
});

test('handles a query error without a cause, cycles, and non-errors', () => {
  expect(safeErrorMessage(new DrizzleQueryError('select 1', [1]))).toBe(
    'query failed',
  );
  const cyclic = new Error('loop');
  cyclic.cause = cyclic;
  expect(safeErrorMessage(cyclic)).toBe('loop');
  expect(safeErrorMessage('admin@example.com')).toBe('unknown error');
});
