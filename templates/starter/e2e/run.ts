// End-to-end test against `wrangler dev` with a local D1 database and real
// Chromium.
//
//   npm run test:e2e
//
// Needs Playwright's Chromium (`npx playwright install chromium`) and network
// access to Cloudflare Turnstile, which runs with Cloudflare's public test
// keys. Builds the site, applies the migrations from
// node_modules/@goodnight-web/server to a fresh database in
// .wrangler/e2e-state, and starts `wrangler dev` three times:
//
// 1. src/worker.ts without Turnstile keys: the home page in ja and en, the
//    admin screen, and the contact form and API refusing messages (503).
// 2. src/worker.ts with the test keys: the server rejects the test-key token
//    (siteverify answers with hostname "example.com" and no action) and
//    stores nothing.
// 3. e2e/worker.ts with the test keys (see that file): validation messages,
//    then a submission that is saved to D1. Then the admin screen in a
//    Japanese browser with a CDP virtual authenticator: first-admin setup
//    with SETUP_TOKEN and an ADMIN_EMAILS address -> passkey registration ->
//    sign-out -> passkey sign-in -> the inquiry in the list with its
//    category label -> switch to English -> the detail -> status change,
//    stored in D1.
//
// Every secret is passed with --var, so a local .dev.vars does not change the
// result. Set E2E_PORT to change the port (default 8841) and
// E2E_SCREENSHOT_DIR to save screenshots.
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from 'playwright';

const siteDir = resolve(import.meta.dirname, '..');
const stateDir = join(siteDir, '.wrangler/e2e-state');
const bin = (name: string) => join(siteDir, 'node_modules/.bin', name);
const port = Number(process.env.E2E_PORT ?? '8841');
const base = `http://localhost:${port}`;
const screenshotDir = process.env.E2E_SCREENSHOT_DIR;

// Cloudflare's public Turnstile test keys: the widget always passes, and
// siteverify accepts every token.
const TEST_SITE_KEY = '1x00000000000000000000AA';
const TEST_SECRET = '1x0000000000000000000000000000000AA';

const SETUP_TOKEN = 'e2e-setup-token-0123456789';
const ADMIN_EMAIL = 'admin@example.com';
const baseVars = {
  SETUP_TOKEN,
  ADMIN_EMAILS: `${ADMIN_EMAIL},colleague@example.com`,
  BETTER_AUTH_SECRET: 'e2e-better-auth-secret-0123456789abcdef',
  IP_HASH_SECRET: 'e2e-ip-hash-secret',
  SLACK_WEBHOOK_URL: '',
};
const noTurnstile = { TURNSTILE_SITE_KEY: '', TURNSTILE_SECRET: '' };
const testTurnstile = {
  TURNSTILE_SITE_KEY: TEST_SITE_KEY,
  TURNSTILE_SECRET: TEST_SECRET,
};

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown): void {
  if (!ok) failures++;
  const suffix = ok || detail === undefined ? '' : ` ${JSON.stringify(detail)}`;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${suffix}`);
}

/** Runs a browser step; a timeout or a missing element counts as a failure. */
async function step(
  name: string,
  action: () => Promise<unknown>,
): Promise<void> {
  try {
    await action();
    check(name, true);
  } catch (error) {
    check(name, false, error instanceof Error ? error.message : String(error));
  }
}

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: siteDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolvePromise(out);
      else
        reject(
          new Error(`${command} ${args.join(' ')} failed:\n${out}\n${err}`),
        );
    });
  });
}

async function query(sql: string): Promise<Record<string, unknown>[]> {
  const out = await run(bin('wrangler'), [
    'd1',
    'execute',
    'DB',
    '--local',
    '--persist-to',
    stateDir,
    '--json',
    '--command',
    sql,
  ]);
  const parsed = JSON.parse(out) as { results: Record<string, unknown>[] }[];
  return parsed[0]?.results ?? [];
}

async function startDev(
  vars: Record<string, string>,
  script?: string,
): Promise<ChildProcess> {
  const dev = spawn(
    bin('wrangler'),
    [
      'dev',
      ...(script ? [script] : []),
      '--port',
      String(port),
      '--ip',
      '127.0.0.1',
      '--persist-to',
      stateDir,
      '--show-interactive-dev-session=false',
      ...Object.entries(vars).flatMap(([key, value]) => [
        '--var',
        `${key}:${value}`,
      ]),
    ],
    {
      cwd: siteDir,
      stdio: ['ignore', 'ignore', 'inherit'],
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    },
  );
  for (let i = 0; i < 120; i++) {
    try {
      const response = await fetch(`${base}/api/contact/config`);
      if (response.ok) return dev;
    } catch {
      // Not up yet.
    }
    await sleep(500);
  }
  dev.kill();
  throw new Error(`wrangler dev did not start on ${base}`);
}

async function stopDev(dev: ChildProcess): Promise<void> {
  const exited = new Promise((resolvePromise) =>
    dev.once('exit', resolvePromise),
  );
  dev.kill('SIGTERM');
  await Promise.race([exited, sleep(5000)]);
  if (dev.exitCode === null) dev.kill('SIGKILL');
  // Wait until the port is free for the next run.
  for (let i = 0; i < 40; i++) {
    try {
      await fetch(base);
    } catch {
      return;
    }
    await sleep(250);
  }
}

async function screenshot(page: Page, name: string): Promise<void> {
  if (!screenshotDir) return;
  // Full-page screenshots of a scrolled page show the sticky header in the
  // middle.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(screenshotDir, name), fullPage: true });
}

async function fillContactForm(page: Page, name: string): Promise<void> {
  await page.fill('#contact-name', name);
  await page.fill('#contact-email', 'visitor@example.org');
  await page.selectOption('#contact-category', 'service');
  await page.fill(
    '#contact-message',
    'テーブルの修理について相談したいです。\nHello from the end-to-end test.',
  );
  await page.check('#contact-consent');
}

async function waitForTurnstileToken(page: Page): Promise<boolean> {
  try {
    await page.waitForFunction(
      () => {
        const input = document.querySelector<HTMLInputElement>(
          '[data-turnstile] input[name="cf-turnstile-response"]',
        );
        return Boolean(input?.value);
      },
      undefined,
      { timeout: 30_000 },
    );
    return true;
  } catch {
    return false;
  }
}

async function withoutTurnstile(browser: Browser): Promise<void> {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });

  await page.goto(`${base}/`);
  check(
    'home page renders in Japanese',
    (await page.getAttribute('html', 'lang')) === 'ja' &&
      (await page.locator('h1').first().textContent())?.trim() !== '',
  );
  await screenshot(page, 'starter-home-ja.png');

  await page.goto(`${base}/en/`);
  check(
    'home page renders in English',
    (await page.getAttribute('html', 'lang')) === 'en' &&
      (await page.locator('h1').first().textContent())?.trim() !== '',
  );
  await screenshot(page, 'starter-home-en.png');

  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  await mobile.goto(`${base}/`);
  await screenshot(mobile, 'starter-home-mobile-ja.png');
  await mobile.close();

  await page.goto(`${base}/contact/`);
  const notice = page.locator('[data-contact-unavailable]');
  await notice.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
  check(
    'contact page says the form is not available yet',
    (await notice.isVisible()) &&
      !(await page.locator('[data-contact-form]').isVisible()),
  );

  const config = (await (await fetch(`${base}/api/contact/config`)).json()) as {
    available?: boolean;
  };
  check('contact config is not available', config.available === false, config);
  const response = await fetch(`${base}/api/contact`, {
    method: 'POST',
    headers: { origin: base, 'content-type': 'application/json' },
    body: '{}',
  });
  const body = (await response.json()) as { error?: { code?: string } };
  check(
    'contact API answers 503 without Turnstile keys',
    response.status === 503 && body.error?.code === 'contact_unavailable',
    { status: response.status, body },
  );

  const admin = await page.goto(`${base}/admin`);
  check(
    '/admin loads the admin UI from the Worker',
    admin?.status() === 200 &&
      (admin.headers()['content-type'] ?? '').startsWith('text/html') &&
      (admin.headers()['content-security-policy'] ?? '') !== '' &&
      (await page.title()) !== '',
    { status: admin?.status(), headers: admin?.headers() },
  );
  await page.close();
}

async function rejectedTestToken(browser: Browser): Promise<void> {
  const page = await browser.newPage();
  await page.goto(`${base}/contact/`);
  await page.locator('[data-contact-form]').waitFor({ state: 'visible' });
  await fillContactForm(page, 'Rejected Visitor');
  check(
    'Turnstile test widget gives a token',
    await waitForTurnstileToken(page),
  );
  await page.click('[data-contact-form] [type="submit"]');
  const message = page.locator('[data-result="turnstile"]');
  await message.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
  check(
    'src/worker.ts rejects the test-key token (hostname and action check)',
    await message.isVisible(),
  );
  const rows = await query('SELECT id FROM submissions');
  check('nothing is stored after a rejected token', rows.length === 0, rows);
  await page.close();
}

async function acceptedSubmission(browser: Browser): Promise<void> {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  await page.goto(`${base}/contact/`);
  const form = page.locator('[data-contact-form]');
  await form.waitFor({ state: 'visible' });
  check('contact form is shown with test keys', await form.isVisible());
  // The server holds messages sent within 3 seconds of showing the form
  // (spam score `too_fast`). Take as long as a person would.
  const shownAt = Date.now();

  await page.click('[data-contact-form] [type="submit"]');
  check(
    'empty form shows the validation message',
    await page.locator('[data-result="invalid"]').isVisible(),
  );
  check(
    'empty name shows a Japanese field error',
    (await page.locator('#contact-name-error').textContent()) ===
      '入力してください。' &&
      (await page.getAttribute('#contact-name', 'aria-invalid')) === 'true',
  );

  await fillContactForm(page, 'E2E 訪問者');
  check(
    'filled fields clear their errors and the summary message',
    (await page.locator('#contact-name-error').isHidden()) &&
      (await page.locator('[data-result="invalid"]').isHidden()),
  );
  check(
    'Turnstile test widget gives a token',
    await waitForTurnstileToken(page),
  );
  await sleep(Math.max(0, 3500 - (Date.now() - shownAt)));
  if (screenshotDir) {
    // Chromium does not paint the Turnstile iframe while it is below the
    // viewport, so make the viewport as tall as the page first.
    const height = await page.evaluate(
      () => document.documentElement.scrollHeight,
    );
    await page.setViewportSize({ width: 1280, height });
    await sleep(1500);
    await screenshot(page, 'starter-contact-ja.png');
    await page.setViewportSize({ width: 1280, height: 800 });
  }

  await page.click('[data-contact-form] [type="submit"]');
  const sent = page.locator('[data-contact-sent]');
  await sent.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
  check('contact form shows the thank-you message', await sent.isVisible());

  const rows = await query(
    'SELECT name, email, category, body, status, ip_hash, page_path FROM submissions',
  );
  const row = rows[0];
  check(
    'the submission is in D1',
    rows.length === 1 &&
      row?.name === 'E2E 訪問者' &&
      row.email === 'visitor@example.org' &&
      row.category === 'service' &&
      row.status === 'new' &&
      row.page_path === '/contact/' &&
      String(row.body).startsWith('テーブルの修理'),
    rows,
  );
  check(
    'ip_hash is an HMAC, not an IP address',
    /^[0-9a-f]{64}$/.test(String(row?.ip_hash)),
    row?.ip_hash,
  );
  await page.close();
}

/**
 * Adds a CTAP2 platform authenticator with resident keys and user
 * verification, so passkey prompts complete without a person.
 */
async function addVirtualAuthenticator(context: BrowserContext, page: Page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send(
    'WebAuthn.addVirtualAuthenticator',
    {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    },
  );
  return async () =>
    (await cdp.send('WebAuthn.getCredentials', { authenticatorId }))
      .credentials;
}

async function adminFlow(browser: Browser): Promise<void> {
  // A Japanese browser: the admin screen picks Japanese by itself.
  const context = await browser.newContext({
    locale: 'ja-JP',
    viewport: { width: 1280, height: 800 },
  });
  // The virtual authenticator would also answer the sign-in screen's passkey
  // autofill. Turn autofill off so the test signs in with the button.
  await context.addInitScript(() => {
    PublicKeyCredential.isConditionalMediationAvailable = async () => false;
  });
  const page = await context.newPage();
  const credentials = await addVirtualAuthenticator(context, page);
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (/content security policy/i.test(message.text())) {
      pageErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const [submission] = await query('SELECT id FROM submissions');
  const id = String(submission?.id);
  const row = page.getByTestId('inquiry-row').filter({ hasText: 'E2E 訪問者' });

  await step('/admin sends a new site to setup (in Japanese)', async () => {
    await page.goto(`${base}/admin`);
    await page.waitForURL(`${base}/admin/setup`);
    await page.getByRole('heading', { name: '最初の管理者を作成' }).waitFor();
  });
  await step('setup with SETUP_TOKEN and an ADMIN_EMAILS address', async () => {
    await page.getByLabel('セットアップトークン').fill(SETUP_TOKEN);
    await page.getByLabel('メールアドレス').fill(ADMIN_EMAIL);
    await page.getByLabel('お名前').fill('管理者');
    await page.getByRole('button', { name: '次へ' }).click();
    await page.getByRole('button', { name: 'パスキーを登録' }).waitFor();
  });
  await step('register a passkey', async () => {
    await page.getByRole('button', { name: 'パスキーを登録' }).click();
    await page
      .getByRole('heading', { name: 'セットアップが完了しました' })
      .waitFor();
  });
  const stored = await credentials();
  check(
    'the authenticator holds one resident credential',
    stored.length === 1 && stored[0]?.isResidentCredential === true,
    stored.length,
  );
  const passkeys = await query('SELECT COUNT(*) AS n FROM passkey');
  check('one passkey is stored in D1', passkeys[0]?.n === 1, passkeys);
  const closed = await query(
    "SELECT 1 AS found FROM settings WHERE key = 'setup_closed_at'",
  );
  check('setup is closed in D1', closed.length === 1, closed);

  await step('setup leads to the list with 1 unread', async () => {
    await page.getByRole('button', { name: 'お問い合わせを開く' }).click();
    await page.waitForURL(`${base}/admin`);
    await page.getByTestId('unread-count').getByText('未読 1 件').waitFor();
  });
  await step('sign out', async () => {
    await page.getByRole('button', { name: 'ログアウト' }).click();
    await page.waitForURL(`${base}/admin/login`);
    await page.getByRole('heading', { name: '管理画面にログイン' }).waitFor();
  });
  const signedOut = await page.evaluate(
    async () => (await fetch('/api/admin/submissions')).status,
  );
  check(
    'the admin API answers 401 after sign-out',
    signedOut === 401,
    signedOut,
  );

  await step('sign in with the passkey', async () => {
    await page.getByRole('button', { name: 'パスキーでログイン' }).click();
    await page.waitForURL(`${base}/admin`);
  });
  await step(
    'the inquiry from the form is in the list with the Japanese category label',
    async () => {
      await row.waitFor();
      await row.getByText('サービスについて', { exact: true }).waitFor();
      await row.getByText('テーブルの修理について相談したいです。').waitFor();
      await page.getByTestId('unread-count').getByText('未読 1 件').waitFor();
    },
  );
  if (screenshotDir) {
    // Let the unread badge finish its color transition.
    await sleep(500);
    await screenshot(page, 'starter-admin-list-ja.png');
  }

  await step('switch the admin screen to English', async () => {
    await page.getByRole('button', { name: /^言語/ }).click();
    await page.getByRole('menuitemradio', { name: 'English' }).click();
    // A radio item keeps the menu open.
    await page.keyboard.press('Escape');
    await page.getByRole('menu').waitFor({ state: 'hidden' });
    await page.getByRole('heading', { name: 'Inquiries' }).waitFor();
    await row.getByText('Our services', { exact: true }).waitFor();
  });
  await step('open the detail, which marks the inquiry read', async () => {
    await row.click();
    await page.waitForURL(`${base}/admin/inquiries/${id}`);
    await page.getByRole('heading', { name: 'E2E 訪問者' }).waitFor();
    await page
      .getByTestId('inquiry-body')
      .getByText('Hello from the end-to-end test.')
      .waitFor();
    await page.getByText('Our services', { exact: true }).waitFor();
    await page.getByTestId('status-select').getByText('Read').waitFor();
    await page.getByTestId('unread-count').getByText('0 unread').waitFor();
  });
  await step('change the status to Done', async () => {
    await page.getByTestId('status-select').click();
    await page.getByRole('option', { name: 'Done' }).click();
    await page.getByText('Status changed to “Done”.').waitFor();
  });
  const status = await query(
    `SELECT status FROM submissions WHERE id = '${id}'`,
  );
  check('the new status is stored in D1', status[0]?.status === 'done', status);
  check(
    'no CSP violations or page errors in the admin screen',
    pageErrors.length === 0,
    pageErrors,
  );
  if (screenshotDir) {
    // Wait for the toast to close so it does not cover the page.
    await page
      .getByText('Status changed to “Done”.')
      .waitFor({ state: 'hidden', timeout: 10_000 })
      .catch(() => {});
    await screenshot(page, 'starter-admin-detail-en.png');
  }
  await context.close();
}

async function main(): Promise<void> {
  if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
  await run(bin('astro'), ['build']);
  await rm(stateDir, { recursive: true, force: true });
  await run(bin('wrangler'), [
    'd1',
    'migrations',
    'apply',
    'DB',
    '--local',
    '--persist-to',
    stateDir,
  ]);

  const browser = await chromium.launch({ headless: true });
  try {
    let dev = await startDev({ ...baseVars, ...noTurnstile });
    try {
      await withoutTurnstile(browser);
    } finally {
      await stopDev(dev);
    }

    dev = await startDev({ ...baseVars, ...testTurnstile });
    try {
      await rejectedTestToken(browser);
    } finally {
      await stopDev(dev);
    }

    dev = await startDev({ ...baseVars, ...testTurnstile }, 'e2e/worker.ts');
    try {
      await acceptedSubmission(browser);
      await adminFlow(browser);
    } finally {
      await stopDev(dev);
    }
  } finally {
    await browser.close();
  }

  console.log(
    failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

await main();
