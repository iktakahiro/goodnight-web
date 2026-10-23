// Takes the admin UI figures for the documentation site, with fictional
// sample inquiries, against `wrangler dev`. Local only, like the e2e test.
//
//   bun run screenshots:docs
//
// Writes `<screen>-<locale>-<scheme>.webp` to apps/docs/public/images/admin/
// and their sizes in CSS pixels to apps/docs/src/site/admin-screens.json,
// which the docs component <AdminScreen> reads. The browser clock and the
// sample times are fixed, so a run without UI changes gives the same images.
//
// Port: E2E_PORT (default 8791). State: .wrangler/docs-screenshot-state.
import { mkdir, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium, type Locator } from 'playwright';
import type { Locale } from '../src/shared/messages.ts';
import { insertSamples, sampleSets } from './samples.ts';
import {
  ADMIN_EMAIL,
  SETUP_TOKEN,
  addVirtualAuthenticator,
  buildPackage,
  freshDatabase,
  packageDir,
  queryDatabase,
  startDevServer,
  testVars,
  ui,
} from './support.ts';

const docsDir = resolve(packageDir, '../../apps/docs');
const outDir = join(docsDir, 'public/images/admin');
const manifestPath = join(docsDir, 'src/site/admin-screens.json');
const stateDir = join(packageDir, '.wrangler/docs-screenshot-state');
const port = Number(process.env.E2E_PORT ?? '8791');

/** The admin UI's content column (`max-w-5xl`) fills this width. */
const VIEWPORT = { width: 1024, height: 720 };
/** About twice the docs column width, for sharp images on HiDPI screens. */
const SCALE = 1.5;
/** WebP quality for the canvas encoder in Chromium. */
const QUALITY = 0.9;
/** Space around a card when a figure is cropped to it: the page gutter. */
const PAD = 24;
/** The browser clock, and the time the sample inquiries are received from. */
const NOW = Date.parse('2026-04-14T15:30:00+09:00');

const locales: readonly Locale[] = ['ja', 'en'];
const schemes = ['light', 'dark'] as const;
type Scheme = (typeof schemes)[number];
type Clip = { x: number; y: number; width: number; height: number };
type Size = { width: number; height: number };

const manifest: Record<string, Partial<Record<Locale, Size>>> = {};

/** The sample shown in the detail figures, from the set of the locale. */
const detailSample = (locale: Locale) => {
  const sample = sampleSets[locale][locale === 'ja' ? 0 : 1];
  if (!sample) throw new Error('missing sample');
  return sample;
};

/** Page coordinates of an element; the page is scrolled to the top first. */
const boxOf = async (locator: Locator): Promise<Clip> => {
  await locator.page().evaluate(() => window.scrollTo(0, 0));
  const box = await locator.boundingBox();
  if (!box) throw new Error(`no box for ${locator.toString()}`);
  return box;
};

/** The element with `pad` CSS pixels around it. */
const around = async (locator: Locator, pad = PAD): Promise<Clip> => {
  const box = await boxOf(locator);
  return {
    x: box.x - pad,
    y: box.y - pad,
    width: box.width + 2 * pad,
    height: box.height + 2 * pad,
  };
};

/** The full width from the top of the page down to the element's bottom. */
const downTo = async (locator: Locator, extra = 24): Promise<Clip> => {
  const box = await boxOf(locator);
  return {
    x: 0,
    y: 0,
    width: VIEWPORT.width,
    height: box.y + box.height + extra,
  };
};

const viewport: Clip = { x: 0, y: 0, ...VIEWPORT };

const main = async () => {
  await mkdir(outDir, { recursive: true });
  for (const file of await readdir(outDir)) {
    if (file.endsWith('.webp')) await rm(join(outDir, file));
  }
  await buildPackage();
  await freshDatabase(stateDir);
  // Keep the samples, received in the past of a fixed clock, from being
  // pruned by the 180-day retention.
  await queryDatabase(
    stateDir,
    "INSERT INTO settings (key, value) VALUES ('retention_days', '3650') ON CONFLICT (key) DO UPDATE SET value = excluded.value",
  );
  let server = await startDevServer({ port, stateDir, vars: testVars });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      locale: 'ja-JP',
      timezoneId: 'Asia/Tokyo',
      viewport: VIEWPORT,
      deviceScaleFactor: SCALE,
    });
    await context.clock.setFixedTime(NOW);
    // Keep the passkey autofill (conditional UI) from signing in by itself.
    await context.addInitScript(() => {
      PublicKeyCredential.isConditionalMediationAvailable = async () => false;
    });
    const page = await context.newPage();
    const encoder = await context.newPage();
    await addVirtualAuthenticator(context, page);
    const { base } = server;

    /** Encodes a PNG as WebP with Chromium's canvas, so no image library. */
    const toWebp = async (png: Buffer): Promise<Buffer> => {
      const url = await encoder.evaluate(
        async ({ data, quality }) => {
          const image = new Image();
          image.src = `data:image/png;base64,${data}`;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          canvas.getContext('2d')?.drawImage(image, 0, 0);
          return canvas.toDataURL('image/webp', quality);
        },
        { data: png.toString('base64'), quality: QUALITY },
      );
      if (!url.startsWith('data:image/webp;base64,')) {
        throw new Error('Chromium did not encode WebP');
      }
      return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
    };

    /** Opens an admin path in the given language and color scheme. */
    const open = async (path: string, locale: Locale, scheme: Scheme) => {
      await page.evaluate(
        (values) => {
          localStorage.setItem('goodnight-web.admin.locale', values.locale);
          localStorage.setItem('goodnight-web.admin.theme', values.scheme);
        },
        { locale, scheme },
      );
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(`${base}${path}`);
    };

    /** Hides the optional Slack note, which every list figure would show. */
    const dismissSlackNote = async (locale: Locale) => {
      const close = page.getByRole('button', {
        name: ui(locale, 'notice.close'),
      });
      if (await close.isVisible()) await close.click();
    };

    const shoot = async (
      name: string,
      locale: Locale,
      scheme: Scheme,
      area: Clip,
    ) => {
      // No hover effects, focus rings, or caret; let transitions settle.
      await page.mouse.move(0, 0);
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(400);
      const x = Math.max(0, Math.round(area.x));
      const y = Math.max(0, Math.round(area.y));
      const clip = {
        x,
        y,
        width: Math.min(Math.round(area.width), VIEWPORT.width - x),
        height: Math.round(area.height),
      };
      const png = await page.screenshot({
        clip,
        fullPage: true,
        animations: 'disabled',
        caret: 'hide',
      });
      const file = `${name}-${locale}-${scheme}.webp`;
      await Bun.write(join(outDir, file), await toWebp(png));
      const size = { width: clip.width, height: clip.height };
      const entry = (manifest[name] ??= {});
      const known = entry[locale];
      if (
        known &&
        (known.width !== size.width || known.height !== size.height)
      ) {
        throw new Error(
          `${file}: ${size.width}x${size.height}, but the other scheme is ${known.width}x${known.height}`,
        );
      }
      entry[locale] = size;
      console.log(`wrote ${file} (${size.width}x${size.height})`);
    };

    /** Runs `take` once for every language and color scheme. */
    const eachVariant = async (
      take: (locale: Locale, scheme: Scheme) => Promise<void>,
      beforeLocale?: (locale: Locale) => Promise<void>,
    ) => {
      for (const locale of locales) {
        await beforeLocale?.(locale);
        for (const scheme of schemes) await take(locale, scheme);
      }
    };

    // First-admin setup, before any admin exists.
    await page.goto(`${base}/admin/setup`);
    await eachVariant(async (locale, scheme) => {
      await open('/admin/setup', locale, scheme);
      await page.getByLabel(ui(locale, 'admin.setup.token')).fill(SETUP_TOKEN);
      await page.getByLabel(ui(locale, 'admin.setup.email')).fill(ADMIN_EMAIL);
      await shoot(
        'setup',
        locale,
        scheme,
        await around(page.locator('#main > div')),
      );
    });
    await open('/admin/setup', 'ja', 'light');
    await page.getByLabel(ui('ja', 'admin.setup.token')).fill(SETUP_TOKEN);
    await page.getByLabel(ui('ja', 'admin.setup.email')).fill(ADMIN_EMAIL);
    await page.getByLabel(ui('ja', 'admin.setup.name')).fill('管理者');
    await page
      .getByRole('button', { name: ui('ja', 'setup.continue') })
      .click();
    await page
      .getByRole('button', { name: ui('ja', 'admin.setup.registerPasskey') })
      .click();
    await page
      .getByRole('button', { name: ui('ja', 'setup.goToList') })
      .click();
    // Each UI language shows the sample set in its own language. The list
    // and detail figures put it in before they are taken.
    const useSamples = (locale: Locale) => insertSamples(stateDir, NOW, locale);

    // Passkey sign-in.
    await page.getByRole('button', { name: ui('ja', 'admin.signOut') }).click();
    await page
      .getByRole('button', { name: ui('ja', 'admin.signIn') })
      .waitFor();
    await eachVariant(async (locale, scheme) => {
      await open('/admin/login', locale, scheme);
      await page
        .getByRole('button', { name: ui(locale, 'admin.signIn') })
        .waitFor();
      await shoot(
        'sign-in',
        locale,
        scheme,
        await around(page.locator('#main > div')),
      );
    });
    await open('/admin/login', 'ja', 'light');
    await page.getByRole('button', { name: ui('ja', 'admin.signIn') }).click();
    await page.waitForURL(`${base}/admin`);

    // The list views, before any detail page marks an inquiry as read.
    const pageContent = page.locator('#main > *').last();
    const listFigure = async (
      name: string,
      path: string | ((locale: Locale) => string),
      ready?: (locale: Locale) => Locator,
    ) =>
      eachVariant(async (locale, scheme) => {
        await open(
          typeof path === 'string' ? path : path(locale),
          locale,
          scheme,
        );
        await page.getByTestId('inquiry-row').first().waitFor();
        await ready?.(locale).waitFor();
        await dismissSlackNote(locale);
        await shoot(name, locale, scheme, await downTo(pageContent));
      }, useSamples);
    await listFigure('inquiry-list', '/admin?view=unread');
    await listFigure('inquiry-spam', '/admin?view=spam', () =>
      page.getByTestId('spam-view-hint'),
    );
    await listFigure(
      'inquiry-search',
      (locale) => `/admin?q=${locale === 'ja' ? 'example.jp' : 'example.com'}`,
      () => page.getByTestId('search-active'),
    );

    // The detail, and the confirmation before a delete.
    await eachVariant(async (locale, scheme) => {
      await open(`/admin/inquiries/${detailSample(locale).id}`, locale, scheme);
      await page.getByTestId('inquiry-body').waitFor();
      await shoot('inquiry-detail', locale, scheme, await downTo(pageContent));
      await page
        .getByRole('button', { name: ui(locale, 'admin.delete') })
        .click();
      await page.getByRole('alertdialog').waitFor();
      await shoot('inquiry-delete', locale, scheme, viewport);
      await page
        .getByRole('button', { name: ui(locale, 'detail.cancel') })
        .click();
      await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
    }, useSamples);
    // Reseeding for each language unread the first detail again. Both
    // inquiries shown above count as read for the figures that follow.
    await queryDatabase(
      stateDir,
      `UPDATE submissions SET status = 'read', read_at = created_at + 3600000 WHERE id IN ('${sampleSets.ja[0]?.id}', '${sampleSets.en[1]?.id}')`,
    );

    // The form editor with the starting form (version 1), its preview, and
    // a new field with its settings open. The new field is not saved.
    await eachVariant(async (locale, scheme) => {
      await open('/admin/form', locale, scheme);
      const addField = page.getByTestId('form-add-field');
      await addField.waitFor();
      await shoot('form-editor', locale, scheme, await downTo(addField));
      await shoot(
        'form-preview',
        locale,
        scheme,
        await around(page.getByTestId('form-preview-card')),
      );
      await addField.click();
      await page.getByLabel(ui(locale, 'form.labelJa')).last().fill('ご予算');
      await page.getByLabel(ui(locale, 'form.labelEn')).last().fill('Budget');
      await shoot(
        'form-field',
        locale,
        scheme,
        // Less than the gap between cards, so no neighbor shows.
        await around(page.getByTestId('form-field-card').last(), 10),
      );
    });

    // Without TURNSTILE_SECRET the contact form is closed and the admin UI
    // shows the setup notice.
    await server.stop();
    const { TURNSTILE_SECRET: _omit, ...withoutTurnstile } = testVars;
    server = await startDevServer({ port, stateDir, vars: withoutTurnstile });
    await eachVariant(async (locale, scheme) => {
      await open('/admin', locale, scheme);
      await page.getByTestId('turnstile-notice').waitFor();
      await page.getByTestId('inquiry-row').first().waitFor();
      await dismissSlackNote(locale);
      await shoot(
        'turnstile-notice',
        locale,
        scheme,
        await downTo(page.getByTestId('turnstile-notice')),
      );
    });
  } finally {
    await browser.close();
    await server.stop();
  }
  await Bun.write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`wrote ${manifestPath}`);
};

await main();
