/// <reference lib="dom" />
/**
 * Renders the share images (`public/images/og/og-ja.png`, `og-en.png`) from
 * an HTML template in headless Chromium. The text comes from the hero block
 * of each top page, the logo from `brand/`, and the fonts from the subsets in
 * `fonts/`, so the output is the same on every machine.
 *
 * Usage: bun run og   (run `bunx playwright install chromium` once before)
 */
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import {
  fivePointStar,
  nightColors,
  sparklePath,
  townShapes,
  townSize,
  type Rect,
} from '../../src/site/night-art.ts';
import { openGraphSize } from '../../src/site/open-graph.ts';
import { readOgCopy, type OgCopy } from './copy.ts';
import { glyphsFor } from './glyphs.ts';

const docs = resolve(import.meta.dirname, '../..');
const fonts = resolve(import.meta.dirname, 'fonts');
const lockup = resolve(docs, '../../brand/goodnight-web-lockup-dark.svg');

const dataUrl = async (path: string, type: string) =>
  `data:${type};base64,${Buffer.from(await Bun.file(path).arrayBuffer()).toString('base64')}`;

const escapeHtml = (text: string) =>
  text.replace(/[&<>"]/gu, (c) => `&#${c.charCodeAt(0)};`);

/** One title line, with the highlighted phrase underlined if it is there. */
function titleLine(line: string, highlight: string): string {
  const start = line.indexOf(highlight);
  if (start < 0) return escapeHtml(line);
  return `${escapeHtml(line.slice(0, start))}<em>${escapeHtml(highlight)}<svg viewBox="0 0 300 12" preserveAspectRatio="none" aria-hidden="true"><path d="M3 8.5C60 4.5 120 3.5 180 5s90 2.5 117 1.5" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round"/></svg></em>${escapeHtml(line.slice(start + highlight.length))}`;
}

/** A row of flat house silhouettes along the bottom edge, one fixed layout. */
function town(): string {
  const rect = (r: Rect) =>
    `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}"/>`;
  const shapes = townShapes().map((house) => {
    const roof =
      house.roof.kind === 'polygon'
        ? `<polygon points="${house.roof.points}"/>`
        : rect(house.roof);
    const windows = house.windows
      .map(
        (w) =>
          `<rect x="${w.x}" y="${w.y}" width="${w.width}" height="${w.height}" fill="${nightColors.litWindow}" opacity="0.8"/>`,
      )
      .join('');
    return `<g>${rect(house.wall)}${roof}${house.chimney ? rect(house.chimney) : ''}${windows}</g>`;
  });
  return `<svg class="town" width="${townSize.width}" height="${townSize.height}" viewBox="0 ${townSize.base - townSize.height} ${townSize.width} ${townSize.height}" fill="${nightColors.house}">${shapes.join('')}</svg>`;
}

/**
 * Scatters star marks over the sky, in the page. Most are four-point sparkles
 * with concave sides, a few are five-point stars. A seeded generator (`seed`)
 * picks sizes, positions, and opacity, so a run always draws the same sky.
 * Each star keeps clear of the logo, the text, the screenshot, and the other
 * stars, counting its own size.
 */
function scatterStars({
  seed,
  sparkle,
  five,
  fill,
}: {
  seed: number;
  sparkle: string;
  five: string;
  fill: string;
}) {
  let state = seed * 2654435761;
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const clear = 20;
  const boxes: DOMRect[] = [];
  for (const selector of ['.logo', '.window', '.town']) {
    const el = document.querySelector(selector);
    if (el) boxes.push(el.getBoundingClientRect());
  }
  // Measure the text itself, not the block that holds it.
  for (const el of document.querySelectorAll('h1 span, p span')) {
    const range = document.createRange();
    range.selectNodeContents(el);
    boxes.push(range.getBoundingClientRect());
  }
  // Diameters in pixels, largest first so they get the room they need.
  const sizes = [
    34, 30, 26, 24, 22, 20, 20, 18, 18, 16, 16, 14, 14, 14, 12, 12, 12, 10, 10,
    10, 8, 8, 8, 8,
  ];
  const placed: { x: number; y: number; r: number }[] = [];
  let marks = '';
  sizes.forEach((size, index) => {
    const r = size / 2;
    for (let attempt = 0; attempt < 300; attempt++) {
      const x = random() * 1200;
      const y = random() * 630;
      const blocked =
        x < r + 12 ||
        x > 1200 - r - 12 ||
        y < r + 12 ||
        y > 630 - r - 12 ||
        boxes.some(
          (b) =>
            x > b.left - clear - r &&
            x < b.right + clear + r &&
            y > b.top - clear - r &&
            y < b.bottom + clear + r,
        ) ||
        placed.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r + 70);
      if (blocked) continue;
      placed.push({ x, y, r });
      const opacity = (0.22 + random() * 0.5).toFixed(2);
      // Every fifth star, from the third, has five points.
      const shape =
        index % 5 === 2
          ? `<polygon points="${five}" transform="rotate(${Math.round(random() * 24 - 12)})"/>`
          : `<path d="${sparkle}"/>`;
      marks += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${r})" opacity="${opacity}">${shape}</g>`;
      return;
    }
  });
  const sky = document.getElementById('sky');
  if (sky)
    sky.innerHTML = `<svg width="1200" height="630" viewBox="0 0 1200 630" fill="${fill}">${marks}</svg>`;
}

async function page(copy: OgCopy): Promise<string> {
  const [regular, bold, inter, logo, shot] = await Promise.all([
    dataUrl(`${fonts}/noto-sans-cjk-jp-regular.otf`, 'font/otf'),
    dataUrl(`${fonts}/noto-sans-cjk-jp-bold.otf`, 'font/otf'),
    dataUrl(`${fonts}/inter-variable.ttf`, 'font/ttf'),
    dataUrl(lockup, 'image/svg+xml'),
    dataUrl(`${docs}/public/${copy.screenshot}`, 'image/webp'),
  ]);
  const ja = copy.locale === 'ja';
  return `<!doctype html>
<html lang="${copy.locale}">
<meta charset="utf-8">
<style>
@font-face { font-family: Inter; font-weight: 100 900; src: url(${inter}); }
@font-face { font-family: NotoJP; font-weight: 400; src: url(${regular}); }
@font-face { font-family: NotoJP; font-weight: 700; src: url(${bold}); }
* { box-sizing: border-box; margin: 0; }
html, body { width: ${openGraphSize.width}px; height: ${openGraphSize.height}px; overflow: hidden; }
body {
  position: relative;
  font-family: Inter, NotoJP, sans-serif;
  color: #f3efff;
  background: linear-gradient(180deg, #1b0f33, #24124a);
}
#sky { position: absolute; left: 0; top: 0; }
.town { position: absolute; left: 0; top: 490px; }
.logo { position: absolute; left: 72px; top: 60px; height: 62px; }
.copy { position: absolute; left: 72px; top: 176px; }
h1 { font-size: ${ja ? 64 : 68}px; font-weight: ${ja ? 700 : 800}; line-height: ${ja ? 1.3 : 1.18}; letter-spacing: ${ja ? '-0.01em' : '-0.03em'}; }
h1 span { display: block; white-space: nowrap; }
h1 em { position: relative; display: inline-block; font-style: normal; color: #f3efff; }
h1 em svg { position: absolute; left: 0; bottom: -0.1em; width: 100%; height: 0.2em; color: #c9b6ff; overflow: visible; }
p { margin-top: ${ja ? 38 : 34}px; width: 520px; font-size: ${ja ? 28 : 28}px; font-weight: 400; line-height: 1.6; color: #cfc4ee; }
p span { display: block; }
.window {
  position: absolute; left: 610px; top: 398px; width: 720px;
  border-radius: 16px 16px 0 0; overflow: hidden; background: #fff;
  box-shadow: 0 0 0 1px rgb(226 216 255 / 22%), 0 24px 64px -8px rgb(8 3 20 / 70%);
}
.bar { display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 16px; background: #efedf3; border-bottom: 1px solid #dedbe5; }
.bar i { width: 11px; height: 11px; border-radius: 50%; background: #cfcbd8; }
.bar b { margin-left: 12px; padding: 3px 14px; border-radius: 999px; background: #fff; font: 500 13px Inter, sans-serif; color: #6b6780; }
.window img { display: block; width: 720px; }
</style>
<body>
<div id="sky"></div>
${town()}
<img class="logo" src="${logo}" alt="">
<div class="copy">
  <h1>${copy.title.map((line) => `<span>${titleLine(line, copy.highlight)}</span>`).join('')}</h1>
  <p>${copy.eyebrow.map((line) => `<span>${escapeHtml(line)}</span>`).join('')}</p>
</div>
<div class="window"><div class="bar"><i></i><i></i><i></i><b>example.com/admin</b></div><img src="${shot}" alt=""></div>
</body></html>`;
}

const copies = await readOgCopy();
const covered = new Set(await Bun.file(`${fonts}/glyphs.txt`).text());
const missing = [...(await glyphsFor(copies))].filter((c) => !covered.has(c));
if (missing.length)
  throw new Error(
    `The font subsets lack ${missing.join('')}. Run: bun run og:fonts`,
  );

const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: openGraphSize,
    deviceScaleFactor: 1,
  });
  for (const copy of copies) {
    const tab = await context.newPage();
    await tab.setContent(await page(copy), { waitUntil: 'load' });
    await tab.evaluate(() => document.fonts.ready);
    await tab.evaluate(scatterStars, {
      seed: copy.locale === 'ja' ? 1 : 2,
      sparkle: sparklePath,
      five: fivePointStar,
      fill: nightColors.star,
    });
    const png = await tab.screenshot({ type: 'png' });
    await Bun.write(`${docs}/public/${copy.output}`, png);
    console.log(`${copy.output}: ${(png.length / 1024).toFixed(0)} KB`);
    await tab.close();
  }
} finally {
  await browser.close();
}
