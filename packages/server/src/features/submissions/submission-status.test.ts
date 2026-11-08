import { describe, expect, test } from 'bun:test';
import {
  isSubmissionStatus,
  SUBMISSION_STATUSES,
} from './submission-status.ts';

describe('isSubmissionStatus', () => {
  test.each(SUBMISSION_STATUSES)('accepts %s', (status) => {
    expect(isSubmissionStatus(status)).toBe(true);
  });

  test('lists unread and read only; suspected spam is a flag, not a status', () => {
    expect([...SUBMISSION_STATUSES]).toEqual(['unread', 'read']);
    expect(isSubmissionStatus('spam')).toBe(false);
  });

  test.each([
    '',
    'UNREAD',
    'Read',
    ' read',
    'read ',
    'all',
    'held',
    'toString',
    '__proto__',
    'constructor',
    '0',
  ])('rejects the string %p', (value) => {
    expect(isSubmissionStatus(value)).toBe(false);
  });

  // Each value is wrapped in a row so that `test.each` does not spread the array.
  test.each([
    [undefined],
    [null],
    [0],
    [1],
    [true],
    [{}],
    [{ toString: () => 'read' }],
    [['read']],
    [new String('read')],
    [Symbol('read')],
  ])('rejects the non-string %p', (value) => {
    expect(isSubmissionStatus(value)).toBe(false);
  });
});
