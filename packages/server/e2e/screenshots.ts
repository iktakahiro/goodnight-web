// Takes screenshots of the admin UI with fictional sample inquiries, for
// pull requests and the documentation. Local only, like the e2e test.
//
//   bun e2e/screenshots.ts <outDir>
//
// Port: E2E_PORT (default 8790). State: .wrangler/screenshot-state.
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import {
  ADMIN_EMAIL,
  SETUP_TOKEN,
  addVirtualAuthenticator,
  buildPackage,
  freshDatabase,
  packageDir,
  startDevServer,
  testVars,
  ui,
} from './support.ts';
import { insertCustomFieldSample, insertSamples, samples } from './samples.ts';

const outDir = resolve(process.argv[2] ?? join(packageDir, '.screenshots'));
const stateDir = join(packageDir, '.wrangler/screenshot-state');
const port = Number(process.env.E2E_PORT ?? '8790');

const shoot = async (page: Page, name: string) => {
  // No hover effects; let transitions settle.
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(outDir, name), fullPage: false });
  console.log(`wrote ${join(outDir, name)}`);
};

const shootFull = async (page: Page, path: string) => {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  await page.screenshot({ path, fullPage: true });
  console.log(`wrote ${path}`);
};

/**
 * Switches the admin UI to dark mode when it has a theme switch.
 *
 * @returns `false` when the admin UI has no dark mode.
 */
const setDarkMode = async (page: Page): Promise<boolean> => {
  const switched = await page.evaluate(() => {
    if (!document.querySelector('[data-testid="theme-switch"]')) return false;
    localStorage.setItem('goodnight-web.admin.theme', 'dark');
    return true;
  });
  if (switched) await page.reload();
  return switched;
};

const setLocale = async (page: Page, locale: 'ja' | 'en') => {
  await page.evaluate(
    (value) => localStorage.setItem('goodnight-web.admin.locale', value),
    locale,
  );
  await page.reload();
};

const setTheme = async (page: Page, theme: 'light' | 'dark') => {
  await page.evaluate(
    (value) => localStorage.setItem('goodnight-web.admin.theme', value),
    theme,
  );
  await page.reload();
};

const main = async () => {
  await mkdir(outDir, { recursive: true });
  await buildPackage();
  await freshDatabase(stateDir);
  let server = await startDevServer({ port, stateDir, vars: testVars });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      locale: 'ja-JP',
      timezoneId: 'Asia/Tokyo',
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
    });
    // Keep the passkey autofill (conditional UI) from signing in by itself.
    await context.addInitScript(() => {
      PublicKeyCredential.isConditionalMediationAvailable = async () => false;
    });
    const page = await context.newPage();
    await addVirtualAuthenticator(context, page);
    const { base } = server;

    await page.goto(`${base}/admin/setup`);
    await page.getByLabel(ui('ja', 'admin.setup.email')).waitFor();
    await page.getByLabel(ui('ja', 'admin.setup.email')).fill(ADMIN_EMAIL);
    await page.getByLabel(ui('ja', 'admin.setup.token')).fill(SETUP_TOKEN);
    await page.getByLabel(ui('ja', 'admin.setup.email')).focus();
    await shoot(page, 'admin-setup-ja.png');
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

    await insertSamples(stateDir, Date.now());

    await page.getByRole('button', { name: ui('ja', 'admin.signOut') }).click();
    await page
      .getByRole('button', { name: ui('ja', 'admin.signIn') })
      .waitFor();
    await shoot(page, 'admin-login-ja.png');
    await setLocale(page, 'en');
    await page
      .getByRole('button', { name: ui('en', 'admin.signIn') })
      .waitFor();
    await shoot(page, 'admin-login-en.png');
    await setLocale(page, 'ja');
    await setTheme(page, 'dark');
    await page
      .getByRole('button', { name: ui('ja', 'admin.signIn') })
      .waitFor();
    await shoot(page, 'admin-login-ja-dark.png');
    await setTheme(page, 'light');
    await page.getByRole('button', { name: ui('ja', 'admin.signIn') }).click();
    await page.waitForURL(`${base}/admin`);

    await page.getByTestId('inquiry-row').first().waitFor();
    await shoot(page, 'admin-list-ja.png');
    await page.goto(`${base}/admin?view=spam`);
    await page.getByTestId('spam-view-hint').waitFor();
    await page.getByTestId('inquiry-row').first().waitFor();
    await shoot(page, 'admin-list-spam-ja.png');
    const spamSample = samples.find((sample) => sample.suspectedSpam);
    await page.goto(`${base}/admin/inquiries/${spamSample?.id}`);
    await page.getByTestId('spam-notice').waitFor();
    await shoot(page, 'admin-detail-spam-ja.png');
    await setTheme(page, 'dark');
    await page.getByTestId('spam-notice').waitFor();
    await shoot(page, 'admin-detail-spam-ja-dark.png');
    await page.goto(`${base}/admin?view=spam`);
    await page.getByTestId('inquiry-row').first().waitFor();
    await shoot(page, 'admin-list-spam-ja-dark.png');
    await setTheme(page, 'light');
    await page.goto(`${base}/admin`);
    await page.getByTestId('inquiry-row').first().waitFor();
    await setLocale(page, 'en');
    await page.getByTestId('inquiry-row').first().waitFor();
    await shoot(page, 'admin-list-en.png');
    await setTheme(page, 'dark');
    await page.getByTestId('inquiry-row').first().waitFor();
    await shoot(page, 'admin-list-en-dark.png');
    await setLocale(page, 'ja');
    await page.getByTestId('inquiry-row').first().waitFor();
    await shoot(page, 'admin-list-ja-dark.png');
    await setTheme(page, 'light');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId('inquiry-row').first().waitFor();
    await shoot(page, 'admin-list-mobile-ja.png');
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.goto(`${base}/admin/inquiries/${samples[1]?.id}`);
    await setLocale(page, 'en');
    await page.getByTestId('inquiry-body').waitFor();
    await shoot(page, 'admin-detail-en.png');
    await setLocale(page, 'ja');
    await page.goto(`${base}/admin/inquiries/${samples[0]?.id}`);
    await page.getByTestId('inquiry-body').waitFor();
    await shoot(page, 'admin-detail-ja.png');
    await setTheme(page, 'dark');
    await page.getByTestId('inquiry-body').waitFor();
    await shoot(page, 'admin-detail-ja-dark.png');
    await setTheme(page, 'light');

    // The form editor: add a "Budget" field and save it as version 2.
    const formDir = join(outDir, 'form-editor');
    await mkdir(formDir, { recursive: true });
    await page.goto(`${base}/admin/form`);
    await page.getByTestId('form-add-field').waitFor();
    await page.getByTestId('form-add-field').click();
    await page.getByLabel(ui('ja', 'form.labelJa')).last().fill('ご予算');
    await page.getByLabel(ui('ja', 'form.labelEn')).last().fill('Budget');
    await page.getByTestId('form-save').click();
    await page.getByText(ui('ja', 'form.saved', { version: 2 })).waitFor();
    await page.waitForTimeout(4500); // Let the toast close.
    await page.evaluate(() => window.scrollTo(0, 0));
    await shootFull(page, join(formDir, 'editor-ja-light.png'));
    // A tall viewport, so the sticky header does not cover the card.
    await page.setViewportSize({ width: 1280, height: 2200 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByTestId('form-preview-card').screenshot({
      path: join(formDir, 'editor-preview-ja.png'),
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    console.log(`wrote ${join(formDir, 'editor-preview-ja.png')}`);
    const customId = await insertCustomFieldSample(stateDir, Date.now());
    await page.goto(`${base}/admin/inquiries/${customId}`);
    await page.getByText('80 万円前後').waitFor();
    await shootFull(page, join(formDir, 'detail-custom-field-ja.png'));
    await page.goto(`${base}/admin`);
    await page.getByTestId('inquiry-row').first().waitFor();
    await shoot(page, 'admin-list-v2-ja.png');
    if (await setDarkMode(page)) {
      await page.goto(`${base}/admin/form`);
      await page.getByTestId('form-add-field').waitFor();
      await shootFull(page, join(formDir, 'editor-ja-dark.png'));
      await page.goto(`${base}/admin/inquiries/${customId}`);
      await page.getByText('80 万円前後').waitFor();
      await shootFull(page, join(formDir, 'detail-custom-field-ja-dark.png'));
      // A narrow window, scrolled sideways: the sticky columns, their
      // shadow, and the edge fade on the dark surfaces.
      await page.setViewportSize({ width: 820, height: 800 });
      await page.goto(`${base}/admin`);
      await page.getByTestId('inquiry-row').first().waitFor();
      await page
        .getByTestId('inquiry-table-scroll')
        .evaluate((element) => element.scrollBy({ left: 160 }));
      await shoot(page, 'admin-list-scrolled-ja-dark.png');
      await page.setViewportSize({ width: 1280, height: 800 });
    }

    // Restart without TURNSTILE_SECRET: the contact form closes and the
    // admin UI shows the setup notice.
    await server.stop();
    const { TURNSTILE_SECRET: _omit, ...withoutTurnstile } = testVars;
    server = await startDevServer({ port, stateDir, vars: withoutTurnstile });
    await page.goto(`${base}/admin`);
    await page.getByTestId('turnstile-notice').waitFor();
    await page.getByTestId('inquiry-row').first().waitFor();
    await shoot(page, 'admin-list-turnstile-notice-ja.png');
  } finally {
    await browser.close();
    await server.stop();
  }
};

await main();
