import {
  add,
  earPath,
  ellipsePath,
  moonBox,
  moonClearance,
  moonGeometry,
  moonPath,
  num,
  pillowFrame,
  pillowPath,
  polar,
  pt,
  smoothClosedPath,
  type MoonParams,
  type PillowParams,
  type Point,
} from './geometry.ts';
import { WORDMARK } from './wordmark.ts';

/** Brand colours. */
export const COLORS = {
  violet: '#743bc4',
  ink: '#341065',
  tint: '#e4d8fb',
  lavender: '#bfabfc',
  darkBackground: '#111113',
  white: '#ffffff',
  tileTint: '#d9c9fb',
} as const;

/** Fill colours of the symbol's parts. */
export interface SymbolPalette {
  readonly moon: string;
  readonly cat: string;
  readonly pillow: string;
  readonly eyes: string;
}

/** Symbol colours for light backgrounds. */
export const LIGHT: SymbolPalette = {
  moon: COLORS.violet,
  cat: COLORS.violet,
  pillow: COLORS.tint,
  eyes: COLORS.tint,
};

/** Symbol colours for the dark background `#111113`. */
export const DARK: SymbolPalette = {
  moon: COLORS.white,
  cat: COLORS.white,
  pillow: COLORS.lavender,
  eyes: COLORS.darkBackground,
};

/** Symbol colours on the violet icon tile. */
export const TILE: SymbolPalette = {
  moon: COLORS.white,
  cat: COLORS.white,
  pillow: COLORS.tileTint,
  eyes: COLORS.violet,
};

// The symbol is drawn in a 512 x 512 design grid.
const MOON: MoonParams = {
  c1: [256, 256],
  R: 224,
  d: 0.218,
  r: 0.813,
  axis: 31,
  tip: 7,
};
const MOON_GEOMETRY = moonGeometry(MOON);
/** Distance from the cat to the inner edge of the moon. */
const CAT_GAP = 14;
const CAT_RADIUS = MOON_GEOMETRY.r - CAT_GAP;

const HEAD_CENTER: Point = [212, 236];
const HEAD_RADIUS = 55;
const PILLOW: PillowParams = {
  c: [270, 274],
  length: 246,
  thickness: 78,
  angle: -24,
  waist: 4,
};

function bodyPath(): string {
  const c2 = MOON_GEOMETRY.c2;
  // The belly follows the moon, the back rises into the rump on the right, and
  // the top and the left end tuck under the pillow: one smooth loaf.
  const bottom = [124, 110, 96, 82, 66, 52].map((deg) =>
    polar(c2, CAT_RADIUS, deg),
  );
  return smoothClosedPath([
    ...bottom,
    [418, 330],
    [404, 298],
    [364, 270],
    [300, 284],
    [238, 312],
    [208, 332],
    [197, 350],
  ]);
}

// Front paws: the cat hugs the pillow from behind, so its arms are hidden and
// the paws show as round mitts hooked over the pillow's upper edge.
const PAW_POSITIONS = [0.64, 0.93];
const PAW_RX = 23;
const PAW_RY = 18;

function pawFrame(t: number) {
  const { r, a, b, u, up } = pillowFrame(PILLOW);
  const center = add(
    [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
    up,
    r - 8,
  );
  return { center, u, up };
}

function pawPaths(): string {
  const { u } = pillowFrame(PILLOW);
  const angle = (Math.atan2(u[1], u[0]) * 180) / Math.PI;
  return PAW_POSITIONS.map((t) =>
    ellipsePath(pawFrame(t).center, PAW_RX, PAW_RY, angle),
  ).join('');
}

function toesPath(): string {
  // Two short notches where the toes curl down onto the pillow.
  return PAW_POSITIONS.map((t) => {
    const { center, u, up } = pawFrame(t);
    return [-7, 7]
      .map((dx) => {
        const base = add(add(center, u, dx), up, -PAW_RY + 1);
        return `M${pt(base)}L${pt(add(base, up, 9))}`;
      })
      .join('');
  }).join('');
}

function eyesPath(): string {
  const v: Point = [
    Math.cos((-24 * Math.PI) / 180),
    Math.sin((-24 * Math.PI) / 180),
  ];
  const n: Point = [-v[1], v[0]];
  let d = '';
  for (const side of [-1, 1]) {
    const ec = add(
      add([HEAD_CENTER[0] + 10, HEAD_CENTER[1]], v, side * 21),
      n,
      6,
    );
    const p0 = add(ec, v, -10);
    const p1 = add(ec, v, 10);
    d += `M${pt(p0)}Q${pt(add(ec, n, 14))} ${pt(p1)}`;
  }
  return d;
}

const TAIL = 'M410 352C438 324 442 268 416 257C400 250 388 260 400 278';

/** The colour role of a shape: which palette entry fills or strokes it. */
export type ShapeRole = keyof SymbolPalette | keyof WordmarkPalette;

/** One path of the logo, with its colour role. */
export interface Shape {
  readonly role: ShapeRole;
  readonly d: string;
  /** Stroke width for a round-capped line; the shape is filled without it. */
  readonly line?: number;
  /** Width of a pillow-coloured outline drawn under the fill. */
  readonly outline?: number;
}

/** Returns the symbol's shapes in the 512 grid, back to front. */
export function symbolShapes(): Shape[] {
  const head = ellipsePath(HEAD_CENTER, HEAD_RADIUS + 3, HEAD_RADIUS - 2, -24);
  const ear1 = earPath(HEAD_CENTER, HEAD_RADIUS, 148, 28, 30, 6);
  const ear2 = earPath(HEAD_CENTER, HEAD_RADIUS, 78, 30, 30, 6);
  for (const ear of [ear1, ear2]) {
    if (moonClearance(ear.tip, MOON) - 6 < CAT_GAP) {
      throw new Error('An ear touches the moon.');
    }
  }
  return [
    { role: 'moon', d: moonPath(MOON) },
    { role: 'cat', d: TAIL, line: 22 },
    { role: 'cat', d: bodyPath() },
    { role: 'pillow', d: pillowPath(PILLOW) },
    { role: 'cat', d: `${head}${ear1.d}${ear2.d}` },
    { role: 'cat', d: pawPaths(), outline: 8 },
    { role: 'eyes', d: toesPath(), line: 5 },
    { role: 'eyes', d: eyesPath(), line: 6 },
  ];
}

/** The symbol's ink box `[x0, y0, x1, y1]` in the 512 grid: the moon's box. */
export const SYMBOL_BOX = moonBox(MOON);

/** Returns the square symbol viewBox with `pad` units of clear space. */
export function symbolViewBox(pad = 8): string {
  const [x0, y0, x1, y1] = SYMBOL_BOX;
  const w = x1 - x0;
  const h = y1 - y0;
  const side = Math.max(w, h) + 2 * pad;
  return [x0 - (side - w) / 2, y0 - (side - h) / 2, side, side]
    .map(num)
    .join(' ');
}

function translate(d: string, dx: number, dy: number): string {
  // The wordmark data uses absolute M, L, H, V, Q, and Z commands only.
  return d.replace(
    /([MLHVQZ])([^MLHVQZ]*)/g,
    (_, cmd: string, args: string) => {
      const values =
        args.trim() === '' ? [] : args.trim().split(/[ ,]+/).map(Number);
      const moved = values.map((v, i) => {
        if (cmd === 'H') return v + dx;
        if (cmd === 'V') return v + dy;
        return v + (i % 2 === 0 ? dx : dy);
      });
      return cmd + moved.map(num).join(' ');
    },
  );
}

/** Colours of the two wordmark words. The star takes the `web` colour. */
export interface WordmarkPalette {
  readonly goodnight: string;
  readonly web: string;
}

const LOCKUP_GAP = 60;
const LOCKUP_PAD = 6;

/** Returns the lockup's shapes: the symbol, then the wordmark to its right. */
export function lockupShapes(): Shape[] {
  const [, y0, x1, y1] = SYMBOL_BOX;
  const dx = x1 + LOCKUP_GAP;
  const dy = (y0 + y1) / 2 - WORDMARK.height / 2;
  return [
    ...symbolShapes(),
    { role: 'goodnight', d: translate(WORDMARK.goodnight, dx, dy) },
    {
      role: 'web',
      d: translate(WORDMARK.web, dx, dy) + translate(WORDMARK.star, dx, dy),
    },
  ];
}

/** Returns the lockup viewBox. */
export function lockupViewBox(): string {
  const [x0, y0, x1, y1] = SYMBOL_BOX;
  const pad = LOCKUP_PAD;
  const right = x1 + LOCKUP_GAP + WORDMARK.width + pad;
  return [x0 - pad, y0 - pad, right - (x0 - pad), y1 - y0 + 2 * pad]
    .map(num)
    .join(' ');
}

function element(
  shape: Shape,
  colors: SymbolPalette & Partial<WordmarkPalette>,
) {
  const color = colors[shape.role];
  if (color === undefined) throw new Error(`No colour for ${shape.role}.`);
  if (shape.line !== undefined) {
    return `<path fill="none" stroke-linecap="round" stroke="${color}" stroke-width="${shape.line}" d="${shape.d}"/>`;
  }
  if (shape.outline !== undefined) {
    return `<path fill="${color}" stroke="${colors.pillow}" stroke-width="${shape.outline}" paint-order="stroke" d="${shape.d}"/>`;
  }
  return `<path fill="${color}" d="${shape.d}"/>`;
}

/** Returns the symbol's SVG elements in the 512 grid, back to front. */
export function symbolElements(c: SymbolPalette): string[] {
  return symbolShapes().map((shape) => element(shape, c));
}

function svgDocument(elements: readonly string[], viewBox: string): string {
  const body = elements.map((e) => `  ${e}`).join('\n');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img">\n` +
    `  <title>goodnight web</title>\n${body}\n</svg>\n`
  );
}

/** Returns the symbol as a square SVG. */
export function symbolSvg(c: SymbolPalette): string {
  return svgDocument(symbolElements(c), symbolViewBox());
}

/** Returns the horizontal lockup: symbol, then the wordmark. */
export function lockupSvg(c: SymbolPalette, words: WordmarkPalette): string {
  const colors = { ...c, ...words };
  return svgDocument(
    lockupShapes().map((shape) => element(shape, colors)),
    lockupViewBox(),
  );
}

const TILE_RADIUS = 113;
const TILE_RECT = `<rect width="512" height="512" rx="${TILE_RADIUS}" fill="${COLORS.violet}"/>`;

/** Returns the app icon: the symbol on a rounded violet tile. */
export function iconSvg(content = 0.8): string {
  const [x0, y0, x1, y1] = SYMBOL_BOX;
  const w = x1 - x0;
  const h = y1 - y0;
  const s = (512 * content) / Math.max(w, h);
  const tx = 256 - (x0 + w / 2) * s;
  const ty = 256 - (y0 + h / 2) * s;
  return svgDocument(
    [
      TILE_RECT,
      `<g transform="translate(${num(tx)} ${num(ty)}) scale(${s.toFixed(4)})">`,
      ...symbolElements(TILE).map((e) => `  ${e}`),
      '</g>',
    ],
    '0 0 512 512',
  );
}

// The favicon is a separate, simpler drawing for 16 to 48 px: a thick moon
// and a cat silhouette (head, ears, body) with a wide gap between them.
const FAVICON_MOON: MoonParams = {
  c1: [250, 262],
  R: 214,
  d: 0.2,
  r: 0.69,
  axis: 40,
  tip: 30,
};
const FAVICON_GAP = 40;

function faviconCat(): [string, string] {
  const g = moonGeometry(FAVICON_MOON);
  const rho = g.r - FAVICON_GAP;
  const [cx, cy] = g.c2;
  const hc: Point = [cx - 22, cy - 26];
  const hr = 58;
  const head = ellipsePath(hc, hr + 4, hr - 2, -8);
  const ear1 = earPath(hc, hr, 108, 36, 28, 10);
  const ear2 = earPath(hc, hr, 46, 36, 28, 10);
  for (const ear of [ear1, ear2]) {
    // The ears point into the opening, where 20 units (1.25 px at 32 px)
    // keep them apart from the moon's tip.
    if (moonClearance(ear.tip, FAVICON_MOON) - 10 < 20) {
      throw new Error('A favicon ear comes too close to the moon.');
    }
  }
  const body = smoothClosedPath([
    ...[140, 115, 90, 65, 40, 18].map((deg) => polar(g.c2, rho, deg)),
    [cx + 98, cy - 4],
    [cx + 62, cy - 22],
    [hc[0] + 20, hc[1] + 30],
    [cx - 80, cy + 4],
  ]);
  // Separate subpaths would cancel out where they overlap, so the body is
  // its own element.
  return [`${head}${ear1.d}${ear2.d}`, body];
}

/** Returns the empty violet tile that the favicon and the icon sit on. */
export function faviconTileSvg(): string {
  return svgDocument([TILE_RECT], '0 0 512 512');
}

/** Returns the favicon: moon and cat silhouette on the violet tile. */
export function faviconSvg(): string {
  return svgDocument(
    [
      TILE_RECT,
      `<path fill="${COLORS.white}" d="${moonPath(FAVICON_MOON)}"/>`,
      ...faviconCat().map((d) => `<path fill="${COLORS.white}" d="${d}"/>`),
    ],
    '0 0 512 512',
  );
}

/** Every brand SVG by file name. */
export function brandSvgs(): Record<string, string> {
  return {
    'goodnight-web-symbol-light.svg': symbolSvg(LIGHT),
    'goodnight-web-symbol-dark.svg': symbolSvg(DARK),
    'goodnight-web-lockup-light.svg': lockupSvg(LIGHT, {
      goodnight: COLORS.ink,
      web: COLORS.violet,
    }),
    'goodnight-web-lockup-dark.svg': lockupSvg(DARK, {
      goodnight: COLORS.white,
      web: COLORS.lavender,
    }),
    'goodnight-web-icon.svg': iconSvg(),
    'goodnight-web-favicon.svg': faviconSvg(),
  };
}
