/**
 * Renders review previews of the brand files into a directory: the lockups,
 * symbols, and icon on their backgrounds, and the favicon frames scaled up
 * 8x without smoothing on white and on #111113.
 *
 * Usage: bun brand/scripts/preview.ts <out-dir>
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { faviconFrames } from './favicon.ts';
import { brandSvgs, COLORS } from './logo.ts';
import { dataUrl, withRenderer } from './render.ts';

const out = process.argv[2];
if (!out) {
  console.error('Usage: bun brand/scripts/preview.ts <out-dir>');
  process.exit(1);
}
await mkdir(out, { recursive: true });

const svgs = brandSvgs();
const BACKGROUNDS = ['#ffffff', COLORS.darkBackground];

function viewBoxRatio(svg: string): number {
  const vb = /viewBox="([^"]+)"/.exec(svg)?.[1]?.split(' ').map(Number);
  if (!vb || vb.length !== 4) throw new Error('SVG has no viewBox.');
  return (vb[3] as number) / (vb[2] as number);
}

function page(body: string, background = '#ffffff'): string {
  return (
    '<!doctype html><html><head><style>' +
    `html,body{margin:0;background:${background}}` +
    'img{display:block;image-rendering:pixelated}' +
    '.row{display:flex;gap:24px;padding:24px;align-items:flex-start}' +
    '</style></head><body>' +
    body +
    '</body></html>'
  );
}

await withRenderer(async (r) => {
  const save = (name: string, data: Uint8Array) =>
    writeFile(join(out, name), data);
  for (const [mode, bg] of [
    ['light', '#ffffff'],
    ['dark', COLORS.darkBackground],
  ] as const) {
    const lockup = svgs[`goodnight-web-lockup-${mode}.svg`] as string;
    await save(
      `lockup-${mode}.png`,
      await r.png(lockup, 1024, Math.round(1024 * viewBoxRatio(lockup)), bg),
    );
    const symbol = svgs[`goodnight-web-symbol-${mode}.svg`] as string;
    await save(`symbol-${mode}.png`, await r.png(symbol, 1024, 1024, bg));
  }
  const icon = svgs['goodnight-web-icon.svg'] as string;
  await save('icon-tile.png', await r.png(icon, 1024, 1024));
  await save(
    'apple-touch-icon.png',
    await r.png(icon, 180, 180, COLORS.violet),
  );

  const frames = await faviconFrames(r);
  const svgFrames = new Map<number, Uint8Array>();
  for (const s of [16, 32, 48]) {
    svgFrames.set(
      s,
      await r.png(svgs['goodnight-web-favicon.svg'] as string, s, s),
    );
  }
  const img = (png: Uint8Array, s: number, scale = 8) =>
    `<img src="${dataUrl('image/png', png)}" width="${s * scale}" height="${s * scale}">`;
  for (const [s, png] of frames) {
    const rows = BACKGROUNDS.map(
      (bg) => `<div class="row" style="background:${bg}">${img(png, s)}</div>`,
    ).join('');
    await save(`favicon-${s}.png`, await r.screenshot(page(rows), s * 8 + 48));
  }
  // ICO frames first, then the SVG as a browser draws it at 16 and 32 px.
  const sheet = BACKGROUNDS.map(
    (bg) =>
      `<div class="row" style="background:${bg}">` +
      [...frames].map(([s, png]) => img(png, s)).join('') +
      img(svgFrames.get(16) as Uint8Array, 16) +
      img(svgFrames.get(32) as Uint8Array, 32) +
      [...frames].map(([s, png]) => img(png, s, 1)).join('') +
      '</div>',
  ).join('');
  await save('favicon-sizes.png', await r.screenshot(page(sheet), 1520));
});
console.log(`Wrote previews to ${out}`);
