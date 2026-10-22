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
//    then a submission that is saved to D1.
//
// Every secret is passed with --var, so a local .dev.vars does not change the
// result. Set E2E_PORT to change the port (default 8791) and
// E2E_SCREENSHOT_DIR to save screenshots.
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium, type Browser, type Page } from 'playwright';

const siteDir = resolve(import.meta.dirname, '..');
const stateDir = join(siteDir, '.wrangler/e2e-state');
const bin = (name: string) => join(siteDir, 'node_modules/.bin', name);
const port = Number(process.env.E2E_PORT ?? '8791');
const base = `http://localhost:${port}`;
const screenshotDir = process.env.E2E_SCREENSHOT_DIR;

// Cloudflare's public Turnstile test keys: the widget always passes, and
// siteverify accepts every token.
const TEST_SITE_KEY = '1x00000000000000000000AA';
const TEST_SECRET = '1x0000000000000000000000000000000AA';

const baseVars = {
  SETUP_TOKEN: 'e2e-setup-token-0123456789',
  ADMIN_EMAILS: 'admin@example.com',
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
