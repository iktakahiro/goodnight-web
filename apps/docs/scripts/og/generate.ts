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

/**
 * Scatters stars over the sky, in the page. A seeded generator (`seed`) picks
 * the positions, so a run always draws the same sky, and stars keep clear of
 * the logo, the text, and the screenshot. Most are small and faint, some are
 * a little larger, and a few are brighter.
 */
function scatterStars(seed: number) {
  let state = seed * 2654435761;
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const clear = 16;
  const boxes: DOMRect[] = [];
  for (const selector of ['.logo', '.window']) {
    const el = document.querySelector(selector);
    if (el) boxes.push(el.getBoundingClientRect());
  }
  // Measure the text itself, not the block that holds it.
  for (const el of document.querySelectorAll('h1 span, p span')) {
    const range = document.createRange();
    range.selectNodeContents(el);
    boxes.push(range.getBoundingClientRect());
  }
  const sky = document.getElementById('sky');
  const placed: [number, number][] = [];
  for (let n = 0; n < 420; n++) {
    const x = random() * 1200;
    const y = random() * 630;
    const roll = random();
    const size = roll < 0.6 ? 1.5 : roll < 0.88 ? 2 : roll < 0.965 ? 2.6 : 3.2;
    const opacity =
      size === 1.5
        ? 0.14 + random() * 0.3
        : size === 2
          ? 0.4 + random() * 0.3
          : 0.75 + random() * 0.25;
    const blocked =
      boxes.some(
        (b) =>
          x > b.left - clear &&
          x < b.right + clear &&
          y > b.top - clear &&
          y < b.bottom + clear,
      ) || placed.some(([px, py]) => Math.hypot(px - x, py - y) < 16);
    if (blocked) continue;
    placed.push([x, y]);
    const star = document.createElement('i');
    star.className = 'star';
    star.style.cssText = `left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;width:${size}px;height:${size}px;opacity:${opacity.toFixed(2)}`;
    sky?.append(star);
  }
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
.star { position: absolute; border-radius: 50%; background: #efe9ff; }
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
    await tab.evaluate(scatterStars, copy.locale === 'ja' ? 1 : 2);
    const png = await tab.screenshot({ type: 'png' });
    await Bun.write(`${docs}/public/${copy.output}`, png);
    console.log(`${copy.output}: ${(png.length / 1024).toFixed(0)} KB`);
    await tab.close();
  }
} finally {
  await browser.close();
}
