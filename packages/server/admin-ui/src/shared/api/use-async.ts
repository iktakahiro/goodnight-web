import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import { ApiError } from './api-client.ts';

/** State of an async load: loading, failed with an {@link ApiError}, or done. */
export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'success'; data: T };

type Settled<T> = Exclude<AsyncState<T>, { status: 'loading' }>;

const toApiError = (error: unknown): ApiError =>
  error instanceof ApiError
    ? error
    : new ApiError(0, 'server_error', 'unexpected error');

/**
 * Runs `load` when `key` changes and returns its state, plus `reload()` and
 * `setData()` for local updates. Results of outdated loads are ignored.
 */
export const useAsync = <T>(
  load: () => Promise<T>,
  key: string,
): AsyncState<T> & {
  reload: () => void;
  setData: (data: T) => void;
} => {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    token: string;
    state: Settled<T>;
  } | null>(null);
  const token = `${attempt}:${key}`;
  const run = useEffectEvent(load);

  useEffect(() => {
    let active = true;
    run().then(
      (data) => {
        if (active) setResult({ token, state: { status: 'success', data } });
      },
      (error: unknown) => {
        if (active) {
          setResult({
            token,
            state: { status: 'error', error: toApiError(error) },
          });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [token]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const setData = useCallback(
    (data: T) => setResult({ token, state: { status: 'success', data } }),
    [token],
  );
  const state: AsyncState<T> =
    result?.token === token ? result.state : { status: 'loading' };
  return { ...state, reload, setData };
};
