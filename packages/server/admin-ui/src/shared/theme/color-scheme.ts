/**
 * The light and dark mode preference of the admin UI.
 *
 * public/theme-init.js applies the same rules before the first paint, so the
 * page never flashes the wrong colors. Keep the two in step;
 * color-scheme.test.ts runs that script against these functions.
 */

/** `localStorage` key that keeps the mode chosen in the header. */
export const THEME_STORAGE_KEY = 'goodnight-web.admin.theme';

/** The choices in the header switch, in menu order. */
export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;

/** A choice in the header switch. `system` follows `prefers-color-scheme`. */
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** The colors in use: a preference with `system` resolved. */
export type ColorScheme = 'light' | 'dark';

/** The media query that tells whether the system uses dark mode. */
export const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Narrows a stored or user-supplied value to a theme preference. */
export const isThemePreference = (value: unknown): value is ThemePreference =>
  typeof value === 'string' &&
  (THEME_PREFERENCES as readonly string[]).includes(value);

/** Reads a stored value. Anything unknown (or nothing) means `system`. */
export const parseThemePreference = (
  stored: string | null | undefined,
): ThemePreference => (isThemePreference(stored) ? stored : 'system');

/** Resolves a preference against the system setting. */
export const resolveColorScheme = (
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ColorScheme =>
  preference === 'system' ? (systemPrefersDark ? 'dark' : 'light') : preference;

/** Reads the saved preference. Returns `null` when storage is unavailable. */
export const readStoredTheme = (): string | null => {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
};

/** Saves the preference. Ignores storage errors (private mode, quota). */
export const storeTheme = (preference: ThemePreference): void => {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // The choice still applies until the page is reloaded.
  }
};

/** Sets or removes the `dark` class on `<html>`, which switches the tokens. */
export const applyColorScheme = (
  root: { classList: Pick<DOMTokenList, 'toggle'> },
  scheme: ColorScheme,
): void => {
  root.classList.toggle('dark', scheme === 'dark');
};
