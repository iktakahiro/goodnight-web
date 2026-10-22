import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DARK_QUERY,
  THEME_STORAGE_KEY,
  applyColorScheme,
  isThemePreference,
  parseThemePreference,
  resolveColorScheme,
} from './color-scheme.ts';

describe('theme preference', () => {
  test('accepts only system, light, and dark', () => {
    expect(isThemePreference('system')).toBe(true);
    expect(isThemePreference('light')).toBe(true);
    expect(isThemePreference('dark')).toBe(true);
    expect(isThemePreference('Dark')).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });

  test('no saved value or an unknown one means system', () => {
    expect(parseThemePreference(null)).toBe('system');
    expect(parseThemePreference(undefined)).toBe('system');
    expect(parseThemePreference('sepia')).toBe('system');
    expect(parseThemePreference('dark')).toBe('dark');
  });

  test('system follows prefers-color-scheme; a manual choice wins', () => {
    expect(resolveColorScheme('system', true)).toBe('dark');
    expect(resolveColorScheme('system', false)).toBe('light');
    expect(resolveColorScheme('light', true)).toBe('light');
    expect(resolveColorScheme('dark', false)).toBe('dark');
  });

  test('the dark class is set only for dark', () => {
    const classes = new Set<string>();
    const root = {
      classList: {
        toggle: (name: string, force?: boolean) => {
          if (force) classes.add(name);
          else classes.delete(name);
          return Boolean(force);
        },
      },
    };
    applyColorScheme(root, 'dark');
    expect(classes.has('dark')).toBe(true);
    applyColorScheme(root, 'light');
    expect(classes.has('dark')).toBe(false);
  });
});

// public/theme-init.js runs before the app and cannot import the module
// above. Run it in a fake page and check that it agrees.
describe('theme-init.js', () => {
  const script = readFileSync(
    join(import.meta.dir, '../../../public/theme-init.js'),
    'utf8',
  );

  const run = (stored: string | null | Error, systemDark: boolean) => {
    const classes = new Set<string>();
    const queries: string[] = [];
    const localStorage = {
      getItem: (key: string) => {
        if (stored instanceof Error) throw stored;
        return key === THEME_STORAGE_KEY ? stored : null;
      },
    };
    const matchMedia = (query: string) => {
      queries.push(query);
      return { matches: systemDark };
    };
    const document = {
      documentElement: {
        classList: {
          toggle: (name: string, force: boolean) => {
            if (force) classes.add(name);
            else classes.delete(name);
          },
        },
      },
    };
    new Function('localStorage', 'matchMedia', 'document', script)(
      localStorage,
      matchMedia,
      document,
    );
    return { dark: classes.has('dark'), queries };
  };

  test.each([
    [null, false],
    [null, true],
    ['system', false],
    ['system', true],
    ['light', true],
    ['dark', false],
    ['unknown', true],
  ] as const)('stored %p with system dark %p', (stored, systemDark) => {
    const expected =
      resolveColorScheme(parseThemePreference(stored), systemDark) === 'dark';
    expect(run(stored, systemDark).dark).toBe(expected);
  });

  test('uses the same media query', () => {
    expect(run(null, false).queries).toEqual([DARK_QUERY]);
  });

  test('follows the system when storage throws', () => {
    expect(run(new Error('SecurityError'), true).dark).toBe(true);
    expect(run(new Error('SecurityError'), false).dark).toBe(false);
  });
});
