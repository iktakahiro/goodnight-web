import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Brand colours. */
export const COLORS = {
  violet: '#743bc4',
  ink: '#341065',
  tint: '#e4d8fb',
  lavender: '#bfabfc',
  darkBackground: '#111113',
  white: '#ffffff',
} as const;

const MASTERS = join(dirname(import.meta.dir), 'masters');

/** A master SVG from `brand/masters/`: its viewBox and its paths by `id`. */
interface Master {
  readonly viewBox: string;
  path(id: string): string;
}

function readMaster(file: string): Master {
  const svg = readFileSync(join(MASTERS, file), 'utf8');
  const viewBox = /<svg[^>]* viewBox="([^"]+)"/.exec(svg)?.[1];
  if (viewBox === undefined) throw new Error(`${file} has no viewBox.`);
  return {
    viewBox,
    path(id) {
      const d = new RegExp(`<path id="${id}"[^>]* d="([^"]+)"`).exec(svg)?.[1];
      if (d === undefined) throw new Error(`${file} has no path "${id}".`);
      return d;
    },
  };
}

// The symbol masters are traced from the approved images; the wordmark is
// Nunito Bold outlines in the symbol's coordinates. See brand/README.md.
const SYMBOL = readMaster('symbol.svg');
const WORDMARK = readMaster('wordmark.svg');
const ICON = readMaster('icon.svg');
const FAVICON = readMaster('favicon.svg');

/**
 * The colour role of a shape. `mark` is the moon and the cat in one path,
 * with the eyes and the line between the cat and the pillow cut out, so the
 * background shows through them. `pillow` is drawn first.
 */
export type ShapeRole = 'mark' | 'pillow' | 'goodnight' | 'web';

/** One filled path of the logo, with its colour role. */
export interface Shape {
  readonly role: ShapeRole;
  readonly d: string;
}

/** Fill colours by role. The wordmark colours are needed for the lockup only. */
export interface Palette {
  readonly mark: string;
  readonly pillow: string;
  readonly goodnight?: string;
  readonly web?: string;
}

/** Colours for white or light backgrounds. */
export const LIGHT: Palette = {
  mark: COLORS.violet,
  pillow: COLORS.tint,
  goodnight: COLORS.ink,
  web: COLORS.violet,
};

/** Colours for the dark background `#111113`. */
export const DARK: Palette = {
  mark: COLORS.white,
  pillow: COLORS.lavender,
  goodnight: COLORS.white,
  web: COLORS.lavender,
};

/** Returns the symbol's shapes, back to front. */
export function symbolShapes(): Shape[] {
  return [
    { role: 'pillow', d: SYMBOL.path('pillow') },
    { role: 'mark', d: SYMBOL.path('mark') },
  ];
}

/** Returns the lockup's shapes: the symbol, then the wordmark to its right. */
export function lockupShapes(): Shape[] {
  return [
    ...symbolShapes(),
    { role: 'goodnight', d: WORDMARK.path('goodnight') },
    { role: 'web', d: WORDMARK.path('web') + WORDMARK.path('star') },
  ];
}

/** Returns the square symbol viewBox. */
export function symbolViewBox(): string {
  return SYMBOL.viewBox;
}

/** Returns the lockup viewBox. */
export function lockupViewBox(): string {
  return WORDMARK.viewBox;
}

function element(shape: Shape, palette: Palette): string {
  const color = palette[shape.role];
  if (color === undefined) throw new Error(`No colour for ${shape.role}.`);
  return `<path fill="${color}" d="${shape.d}"/>`;
}

function svgDocument(elements: readonly string[], viewBox: string): string {
  const body = elements.map((e) => `  ${e}`).join('\n');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img">\n` +
    `  <title>goodnight web</title>\n${body}\n</svg>\n`
  );
}

/** Returns the symbol as a square SVG. */
export function symbolSvg(palette: Palette): string {
  return svgDocument(
    symbolShapes().map((shape) => element(shape, palette)),
    symbolViewBox(),
  );
}

/** Returns the horizontal lockup: the symbol, then the wordmark. */
export function lockupSvg(palette: Palette): string {
  return svgDocument(
    lockupShapes().map((shape) => element(shape, palette)),
    lockupViewBox(),
  );
}

const TILE = `<rect width="512" height="512" rx="94" fill="${COLORS.violet}"/>`;

/** Returns the app icon: the traced tile symbol on a rounded violet tile. */
export function iconSvg(): string {
  return svgDocument(
    [
      TILE,
      `<path fill="${COLORS.tint}" d="${ICON.path('pillow')}"/>`,
      `<path fill="${COLORS.white}" d="${ICON.path('mark')}"/>`,
    ],
    ICON.viewBox,
  );
}

/** Returns the empty violet tile that the favicon and the icon sit on. */
export function faviconTileSvg(): string {
  return svgDocument([TILE], FAVICON.viewBox);
}

/**
 * Returns the favicon: the icon symbol as one white silhouette, without the
 * face lines and with a wider gap between the cat and the moon, so that it
 * stays readable at 32 and 48 px.
 */
export function faviconSvg(): string {
  return svgDocument(
    [TILE, `<path fill="${COLORS.white}" d="${FAVICON.path('mark')}"/>`],
    FAVICON.viewBox,
  );
}

/** Every brand SVG by file name. */
export function brandSvgs(): Record<string, string> {
  return {
    'goodnight-web-symbol-light.svg': symbolSvg(LIGHT),
    'goodnight-web-symbol-dark.svg': symbolSvg(DARK),
    'goodnight-web-lockup-light.svg': lockupSvg(LIGHT),
    'goodnight-web-lockup-dark.svg': lockupSvg(DARK),
    'goodnight-web-icon.svg': iconSvg(),
    'goodnight-web-favicon.svg': faviconSvg(),
  };
}
