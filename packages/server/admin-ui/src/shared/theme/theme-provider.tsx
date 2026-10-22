import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DARK_QUERY,
  applyColorScheme,
  parseThemePreference,
  readStoredTheme,
  resolveColorScheme,
  storeTheme,
  type ColorScheme,
  type ThemePreference,
} from './color-scheme.ts';

interface ThemeValue {
  /** The choice in the header switch. */
  preference: ThemePreference;
  /** The colors in use. */
  scheme: ColorScheme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

const systemPrefersDark = (): boolean =>
  typeof matchMedia === 'function' && matchMedia(DARK_QUERY).matches;

/**
 * Provides the light or dark mode. The initial preference is the saved one
 * (or `system`); `setPreference` saves the choice and updates the `dark`
 * class on `<html>`. With `system`, a change of the system setting applies
 * right away.
 */
export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    parseThemePreference(readStoredTheme()),
  );
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const query = matchMedia(DARK_QUERY);
    const onChange = () => setSystemDark(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const scheme = resolveColorScheme(preference, systemDark);
  useEffect(() => {
    applyColorScheme(document.documentElement, scheme);
  }, [scheme]);

  const setPreference = useCallback((next: ThemePreference) => {
    storeTheme(next);
    setPreferenceState(next);
  }, []);

  const value = useMemo<ThemeValue>(
    () => ({ preference, scheme, setPreference }),
    [preference, scheme, setPreference],
  );
  return <ThemeContext value={value}>{children}</ThemeContext>;
};

/** Returns the theme preference, the colors in use, and `setPreference`. */
export const useTheme = (): ThemeValue => {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside <ThemeProvider>');
  return value;
};
