import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Checks the WCAG 2.2 AA contrast of the admin theme's main color pairs in
// both modes, reading the tokens from styles.css: 4.5:1 for text, 3:1 for
// control boundaries and focus rings (SC 1.4.3 and 1.4.11).

const css = readFileSync(join(import.meta.dir, '../../styles.css'), 'utf8');

const block = (selector: RegExp): string => {
  const start = css.search(selector);
  if (start < 0) throw new Error(`No ${selector} block in styles.css`);
  const open = css.indexOf('{', start);
  return css.slice(open + 1, css.indexOf('}', open));
};

const tokens = (source: string): Map<string, string> =>
  new Map(
    [...source.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6});/g)].map(
      (match) => [match[1] ?? '', match[2] ?? ''],
    ),
  );

const light = tokens(block(/@theme static \{/));
const dark = new Map([...light, ...tokens(block(/:root\.dark \{/))]);

const luminance = (hex: string): number => {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** The WCAG contrast ratio of two 6-digit hex colors. */
const contrast = (a: string, b: string): number => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
};

const TEXT = 4.5;
const UI = 3;

/** [foreground token, background token, minimum ratio] */
const PAIRS: readonly (readonly [string, string, number])[] = [
  ['foreground', 'background', TEXT],
  ['foreground', 'muted', TEXT],
  ['card-foreground', 'card', TEXT],
  ['popover-foreground', 'popover', TEXT],
  ['muted-foreground', 'background', TEXT],
  ['muted-foreground', 'card', TEXT],
  ['muted-foreground', 'muted', TEXT],
  ['primary', 'background', TEXT],
  ['primary', 'card', TEXT],
  ['primary-foreground', 'primary', TEXT],
  ['primary-foreground', 'primary-hover', TEXT],
  ['secondary-foreground', 'secondary', TEXT],
  ['accent-foreground', 'accent', TEXT],
  ['destructive', 'card', TEXT],
  ['destructive', 'destructive-soft', TEXT],
  ['destructive-foreground', 'destructive', TEXT],
  ['destructive-foreground', 'destructive-hover', TEXT],
  ['warning-foreground', 'warning-soft', TEXT],
  ['success-foreground', 'success-soft', TEXT],
  ['info-foreground', 'info-soft', TEXT],
  ['warning-icon', 'warning-soft', UI],
  ['input', 'card', UI],
  ['input', 'background', UI],
  ['ring', 'card', UI],
  ['ring', 'background', UI],
  ['primary', 'accent', TEXT],
  ['logo-moon', 'logo-tile', UI],
  ['link', 'background', TEXT],
  ['link', 'card', TEXT],
  ['link', 'muted', TEXT],
];

describe('admin theme contrast (WCAG AA)', () => {
  for (const [mode, colors] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    test.each(PAIRS)(`${mode}: %s on %s is at least %d:1`, (fg, bg, min) => {
      const a = colors.get(fg);
      const b = colors.get(bg);
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      expect(contrast(a ?? '', b ?? '')).toBeGreaterThanOrEqual(min);
    });
  }

  test('dark mode overrides every light color', () => {
    const overridden = tokens(block(/:root\.dark \{/));
    expect([...light.keys()].filter((key) => !overridden.has(key))).toEqual([]);
  });
});
