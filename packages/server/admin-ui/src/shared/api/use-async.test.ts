import { describe, expect, test } from 'bun:test';
import { ApiError } from './api-client.ts';
import { visibleState, type AsyncResult } from './use-async.ts';

const loaded = (key: string, attempt: number): AsyncResult<string> => ({
  key,
  attempt,
  state: { status: 'success', data: `${key}#${attempt}` },
});

describe('visibleState', () => {
  test('is loading before the first result', () => {
    expect(visibleState(null, 'a', 0, false)).toEqual({ status: 'loading' });
    expect(visibleState(null, 'a', 0, true)).toEqual({ status: 'loading' });
  });

  test('shows the result of the current load', () => {
    expect(visibleState(loaded('a', 2), 'a', 2, false)).toEqual({
      status: 'success',
      data: 'a#2',
    });
  });

  test('a background refresh keeps the earlier data', () => {
    expect(visibleState(loaded('a', 1), 'a', 2, true)).toEqual({
      status: 'success',
      data: 'a#1',
    });
  });

  test('a reload shows loading', () => {
    expect(visibleState(loaded('a', 1), 'a', 2, false)).toEqual({
      status: 'loading',
    });
  });

  test('a new key never shows the data of another key', () => {
    expect(visibleState(loaded('a', 1), 'b', 1, false)).toEqual({
      status: 'loading',
    });
    expect(visibleState(loaded('a', 1), 'b', 2, true)).toEqual({
      status: 'loading',
    });
  });

  test('a refresh after an error shows loading, not the old error', () => {
    const failed: AsyncResult<string> = {
      key: 'a',
      attempt: 1,
      state: {
        status: 'error',
        error: new ApiError(500, 'server_error', 'failed'),
      },
    };
    expect(visibleState(failed, 'a', 2, true)).toEqual({ status: 'loading' });
    expect(visibleState(failed, 'a', 1, true)).toBe(failed.state);
  });
});
