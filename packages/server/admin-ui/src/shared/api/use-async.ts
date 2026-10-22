import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import { ApiError } from './api-client.ts';

/** State of an async load: loading, failed with an {@link ApiError}, or done. */
export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'success'; data: T };

type Settled<T> = Exclude<AsyncState<T>, { status: 'loading' }>;

/** The last settled load: its key, its attempt, and its state. */
export interface AsyncResult<T> {
  key: string;
  attempt: number;
  state: Settled<T>;
}

/**
 * Picks the state to show for `key` and `attempt`. The result of exactly
 * this load is shown when it has settled. While a background refresh
 * (`quiet`) of the same key runs, the data of an earlier attempt stays.
 * Anything else is loading: a new key never shows another key's data.
 */
export const visibleState = <T>(
  result: AsyncResult<T> | null,
  key: string,
  attempt: number,
  quiet: boolean,
): AsyncState<T> => {
  if (result?.key !== key) return { status: 'loading' };
  if (result.attempt === attempt) return result.state;
  return quiet && result.state.status === 'success'
    ? result.state
    : { status: 'loading' };
};

const toApiError = (error: unknown): ApiError =>
  error instanceof ApiError
    ? error
    : new ApiError(0, 'server_error', 'unexpected error');

/**
 * Runs `load` when `key` changes and returns its state, plus `reload()`,
 * `refresh()`, and `setData()` for local updates. `reload()` shows loading
 * again; `refresh()` loads again in the background and keeps the current
 * data until the new result arrives. Results of outdated loads are ignored.
 */
export const useAsync = <T>(
  load: () => Promise<T>,
  key: string,
): AsyncState<T> & {
  reload: () => void;
  refresh: () => void;
  setData: (data: T) => void;
} => {
  const [request, setRequest] = useState({ attempt: 0, quiet: false });
  const [result, setResult] = useState<AsyncResult<T> | null>(null);
  const { attempt, quiet } = request;
  const run = useEffectEvent(load);

  useEffect(() => {
    let active = true;
    run().then(
      (data) => {
        if (active) {
          setResult({ key, attempt, state: { status: 'success', data } });
        }
      },
      (error: unknown) => {
        if (active) {
          setResult({
            key,
            attempt,
            state: { status: 'error', error: toApiError(error) },
          });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [key, attempt]);

  const reload = useCallback(
    () =>
      setRequest((current) => ({ attempt: current.attempt + 1, quiet: false })),
    [],
  );
  const refresh = useCallback(
    () =>
      setRequest((current) => ({ attempt: current.attempt + 1, quiet: true })),
    [],
  );
  const setData = useCallback(
    (data: T) =>
      setResult({ key, attempt, state: { status: 'success', data } }),
    [key, attempt],
  );
  return {
    ...visibleState(result, key, attempt, quiet),
    reload,
    refresh,
    setData,
  };
};
