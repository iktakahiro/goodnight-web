import { COLORS, faviconSvg, faviconTileSvg } from './logo.ts';
import type { Renderer } from './render.ts';

/**
 * The 16 px favicon frame, drawn by hand on top of the violet tile, because a
 * rasterised SVG blurs the moon and the cat together at this size. `w` is
 * white, `+` and `-` are partly transparent white, and `.` shows the tile.
 */
export const FAVICON_16: readonly string[] = [
  '................',
  '................',
  '.....-+w+.......',
  '...-ww+-........',
  '..+ww-..w..w....',
  '..ww-...wwww....',
  '.+ww....wwww-...',
  '.www...wwwwwww..',
  '.www...wwwwwww+.',
  '.www+...wwwwww..',
  '.+ww+...........',
  '..www+......+w+.',
  '..-wwwww++wwww-.',
  '...-wwwwwwwww-..',
  '.....-+www+-....',
  '................',
];

const FAVICON_16_COLORS: Record<string, string> = {
  '.': 'transparent',
  w: COLORS.white,
  '+': 'rgba(255, 255, 255, 0.65)',
  '-': 'rgba(255, 255, 255, 0.3)',
};

/**
 * Returns the favicon frames as PNG bytes by size: 16 px from `FAVICON_16`,
 * and 32 and 48 px from the favicon SVG.
 */
export async function faviconFrames(
  r: Renderer,
): Promise<Map<number, Uint8Array>> {
  const svg = faviconSvg();
  return new Map([
    [
      16,
      await r.layers([
        await r.png(faviconTileSvg(), 16, 16),
        await r.pixels(FAVICON_16, FAVICON_16_COLORS),
      ]),
    ],
    [32, await r.png(svg, 32, 32)],
    [48, await r.png(svg, 48, 48)],
  ]);
}
