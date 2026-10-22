/// <reference lib="dom" />
import { chromium, type Browser, type Page } from 'playwright';

/** Rasterises SVG and composes preview sheets in headless Chromium. */
export interface Renderer {
  /**
   * Draws `svg` scaled to `width` x `height` px on a canvas and returns PNG
   * bytes. Without `background` the PNG keeps transparency.
   */
  png(
    svg: string,
    width: number,
    height: number,
    background?: string,
  ): Promise<Uint8Array>;
  /** Draws a pixel map (one string per row, one character per pixel) and returns PNG bytes. */
  pixels(
    rows: readonly string[],
    colors: Record<string, string>,
  ): Promise<Uint8Array>;
  /** Draws PNG images on top of each other and returns PNG bytes. */
  layers(pngs: readonly Uint8Array[]): Promise<Uint8Array>;
  /** Renders an HTML page at `width` px and returns a full-page screenshot. */
  screenshot(html: string, width: number): Promise<Uint8Array>;
}

/** Returns a `data:` URL for PNG or SVG bytes or text. */
export function dataUrl(
  type: 'image/png' | 'image/svg+xml',
  data: Uint8Array | string,
) {
  return `data:${type};base64,${Buffer.from(data).toString('base64')}`;
}

async function canvasPng(
  page: Page,
  src: string,
  width: number,
  height: number,
  background: string | null,
): Promise<Uint8Array> {
  const url = await page.evaluate(
    async ({ src, width, height, background }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No 2D canvas context.');
      if (background) {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, width, height);
      }
      ctx.drawImage(img, 0, 0, width, height);
      return canvas.toDataURL('image/png');
    },
    { src, width, height, background },
  );
  return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
}

/**
 * Starts headless Chromium from the Playwright browser cache, runs `fn`, and
 * closes the browser. Run `bunx playwright install chromium` first if the
 * browser is missing.
 */
export async function withRenderer<T>(
  fn: (r: Renderer) => Promise<T>,
): Promise<T> {
  const browser: Browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html><body></body></html>');
    const renderer: Renderer = {
      png: (svg, width, height, background) =>
        canvasPng(
          page,
          dataUrl('image/svg+xml', svg),
          width,
          height,
          background ?? null,
        ),
      pixels: async (rows, colors) => {
        const url = await page.evaluate(
          ({ rows, colors }) => {
            const size = rows.length;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('No 2D canvas context.');
            rows.forEach((row, y) => {
              [...row].forEach((ch, x) => {
                const color = colors[ch];
                if (color === undefined)
                  throw new Error(`Unknown pixel "${ch}".`);
                if (color === 'transparent') return;
                ctx.fillStyle = color;
                ctx.fillRect(x, y, 1, 1);
              });
            });
            return canvas.toDataURL('image/png');
          },
          { rows: [...rows], colors },
        );
        return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
      },
      layers: async (pngs) => {
        const url = await page.evaluate(
          async (srcs) => {
            const images = await Promise.all(
              srcs.map(async (src) => {
                const img = new Image();
                img.src = src;
                await img.decode();
                return img;
              }),
            );
            const first = images[0];
            if (!first) throw new Error('No layers.');
            const canvas = document.createElement('canvas');
            canvas.width = first.naturalWidth;
            canvas.height = first.naturalHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('No 2D canvas context.');
            for (const img of images) ctx.drawImage(img, 0, 0);
            return canvas.toDataURL('image/png');
          },
          pngs.map((png) => dataUrl('image/png', png)),
        );
        return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
      },
      screenshot: async (html, width) => {
        const shot = await browser.newPage({
          viewport: { width, height: 100 },
        });
        try {
          await shot.setContent(html);
          return await shot.screenshot({ fullPage: true });
        } finally {
          await shot.close();
        }
      },
    };
    return await fn(renderer);
  } finally {
    await browser.close();
  }
}
