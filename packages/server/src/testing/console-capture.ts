import { spyOn } from 'bun:test';

const METHODS = ['error', 'warn', 'log', 'info', 'debug'] as const;

/**
 * Silences every console method and records what was logged. `text()`
 * renders the calls with `Bun.inspect`, which shows error messages, causes,
 * and own properties (such as a Drizzle error's `params`), unlike
 * `JSON.stringify`. Call `restore()` in a `finally` block.
 */
export const captureConsole = () => {
  const spies = METHODS.map((method) =>
    spyOn(console, method).mockImplementation(() => {}),
  );
  return {
    text: (): string =>
      spies
        .flatMap((spy) => spy.mock.calls.map((call) => Bun.inspect(call)))
        .join('\n'),
    restore: (): void => {
      for (const spy of spies) spy.mockRestore();
    },
  };
};
