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
// 3. e2e/worker.ts with the test keys (see that file): the form rendered
//    from GET /api/contact/form, validation messages, then a submission that
//    is saved to D1 (`fields` JSON and `form_version`). Then the admin screen
//    in a Japanese browser with a CDP virtual authenticator: first-admin
//    setup with APP_SECRET (or SETUP_TOKEN) and an ADMIN_EMAILS address ->
//    passkey registration -> sign-out -> passkey sign-in -> the inquiry in
//    the list -> switch to English -> the detail with the field labels,
//    marked read -> back to unread, stored in D1. The stored ip_hash is
//    checked against the key from IP_HASH_SECRET or APP_SECRET.
//
// E2E_SECRETS picks the secrets: `app-secret` (the default) sets APP_SECRET
// and ADMIN_EMAILS only, as the Deploy to Cloudflare form does; `legacy` sets
// the four variables SETUP_TOKEN, ADMIN_EMAILS, BETTER_AUTH_SECRET, and
// IP_HASH_SECRET of earlier sites instead.
//
// Every secret is passed with --var, and the secrets of the other mode as
// empty values, so a local .dev.vars does not change the result. Set E2E_PORT
// to change the port (default 8841), E2E_SCREENSHOT_DIR to save screenshots,
// and E2E_DEBUG_DIR to save a screenshot of each failed admin step and a
// Playwright trace of the admin screen (trace.zip, open it with
// `npx playwright show-trace`).
//
// Button names and headings in the admin screen come from
// @goodnight-web/server/admin-messages.json, and the contact form fields and
// their labels from GET /api/contact/form (edited in the admin screen), so
// wording changes do not break the test.
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import adminMessages from '@goodnight-web/server/admin-messages.json' with { type: 'json' };
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from 'playwright';
import type {
  PublicContactForm,
  PublicFormField,
} from '@goodnight-web/server/client';
import { siteConfig } from '../site.config.ts';

const siteDir = resolve(import.meta.dirname, '..');
const stateDir = join(siteDir, '.wrangler/e2e-state');
const bin = (name: string) => join(siteDir, 'node_modules/.bin', name);
const port = Number(process.env.E2E_PORT ?? '8841');
const base = `http://localhost:${port}`;
const screenshotDir = process.env.E2E_SCREENSHOT_DIR;
const debugDir = process.env.E2E_DEBUG_DIR;

// Cloudflare's public Turnstile test keys: the widget always passes, and
// siteverify accepts every token.
const TEST_SITE_KEY = '1x00000000000000000000AA';
const TEST_SECRET = '1x0000000000000000000000000000000AA';

const E2E_SECRETS = ((): 'app-secret' | 'legacy' => {
  const mode = process.env.E2E_SECRETS ?? 'app-secret';
  if (mode === 'app-secret' || mode === 'legacy') return mode;
  throw new Error(`E2E_SECRETS must be app-secret or legacy, not ${mode}`);
})();
const ADMIN_EMAIL = 'admin@example.com';
const secretVars =
  E2E_SECRETS === 'legacy'
    ? {
        APP_SECRET: '',
        SETUP_TOKEN: 'e2e-setup-token-0123456789abcdefghij',
        BETTER_AUTH_SECRET: 'e2e-better-auth-secret-0123456789abcdef',
        IP_HASH_SECRET: 'e2e-ip-hash-secret-0123456789abcdef',
      }
    : {
        APP_SECRET: 'e2e-app-secret-0123456789abcdefghijklmn',
        SETUP_TOKEN: '',
        BETTER_AUTH_SECRET: '',
        IP_HASH_SECRET: '',
      };
/** The secret the setup screen asks for, and its value. */
const SETUP_TOKEN_NAME =
  E2E_SECRETS === 'legacy' ? 'SETUP_TOKEN' : 'APP_SECRET';
const SETUP_TOKEN = secretVars[SETUP_TOKEN_NAME];
const baseVars = {
  ...secretVars,
  ADMIN_EMAILS: `${ADMIN_EMAIL},colleague@example.com`,
  SLACK_WEBHOOK_URL: '',
};
const noTurnstile = { TURNSTILE_SITE_KEY: '', TURNSTILE_SECRET: '' };
const testTurnstile = {
  TURNSTILE_SITE_KEY: TEST_SITE_KEY,
  TURNSTILE_SECRET: TEST_SECRET,
};

/**
 * An admin screen string from the catalog in @goodnight-web/server, with
 * `{name}` placeholders filled. The test finds buttons and headings by these
 * strings, so a package update that changes the wording does not break it.
 */
function ui(
  locale: 'ja' | 'en',
  key: keyof (typeof adminMessages)['en'],
  params: Readonly<Record<string, string | number>> = {},
): string {
  return adminMessages[locale][key].replace(/\{(\w+)\}/g, (match, name) =>
    String(params[name] ?? match),
  );
}

const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

/**
 * The key the server hashes IP addresses with: IP_HASH_SECRET, or the key it
 * derives from APP_SECRET (HKDF-SHA-256, empty salt, the fixed label
 * `goodnight-web:ip-hash`, 32 bytes written as hex).
 */
async function ipHashKey(): Promise<string> {
  if (secretVars.IP_HASH_SECRET) return secretVars.IP_HASH_SECRET;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secretVars.APP_SECRET),
    'HKDF',
    false,
    ['deriveBits'],
  );
  return hex(
    await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new Uint8Array(0),
        info: encoder.encode('goodnight-web:ip-hash'),
      },
      key,
      256,
    ),
  );
}

async function hmacSha256Hex(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

const VISITOR_NAME = 'E2E 訪問者';
const MESSAGE =
  'テーブルの修理について相談したいです。\nHello from the end-to-end test.';

/** The contact form as the Worker serves it. */
async function loadForm(): Promise<PublicContactForm> {
  return (await (
    await fetch(`${base}/api/contact/form`)
  ).json()) as PublicContactForm;
}

/**
 * The fields the test fills in: the first text field (the name), the first
 * text area (the message), and the first select (the category). The test
 * fails early when the form has none of them.
 */
function pickFields(form: PublicContactForm) {
  const first = (type: PublicFormField['type']) => {
    const field = form.fields.find((entry) => entry.type === type);
    if (!field) throw new Error(`the contact form has no ${type} field`);
    return field;
  };
  const select = first('select');
  const option = select.options?.[0];
  if (!option) throw new Error('the select field has no options');
  return { name: first('text'), message: first('textarea'), select, option };
}

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown): void {
  if (!ok) failures++;
  const suffix = ok || detail === undefined ? '' : ` ${JSON.stringify(detail)}`;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${suffix}`);
}

/**
 * Runs a browser step on `page`; a timeout or a missing element counts as a
 * failure.
 */
async function step(
  page: Page,
  name: string,
  action: () => Promise<unknown>,
): Promise<void> {
  try {
    await action();
    check(name, true);
  } catch (error) {
    check(name, false, error instanceof Error ? error.message : String(error));
    if (debugDir) {
      const file = join(debugDir, `${failures}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(`  url: ${page.url()} screenshot: ${file}`);
    }
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
      const response = await fetch(`${base}/api/contact/form`);
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

/** Fills every field of the rendered form, found by its label from the API. */
async function fillContactForm(
  page: Page,
  form: PublicContactForm,
  name: string,
): Promise<void> {
  const picked = pickFields(form);
  // The email field is fixed (not part of the editable form).
  await page.fill('#contact-email', 'visitor@example.org');
  for (const field of form.fields) {
    const label = field.label.ja || field.label.en;
    if (field.type === 'radio' || field.type === 'checkbox') {
      const option = field.options?.[0];
      if (option) {
        await page
          .getByRole('group', { name: label })
          .getByLabel(option.label.ja || option.label.en)
          .check();
      }
      continue;
    }
    const control = page.getByLabel(label).first();
    if (field.type === 'select') {
      await control.selectOption(
        field === picked.select ? picked.option.value : '',
      );
    } else if (field === picked.name) {
      await control.fill(name);
    } else if (field === picked.message) {
      await control.fill(MESSAGE);
    } else if (field.type === 'tel') {
      await control.fill('03-1234-5678');
    } else if (field.required) {
      const sample = {
        text: 'e2e',
        textarea: 'e2e',
        url: 'https://example.org/',
        number: '3',
        date: '2026-11-02',
      } as const;
      await control.fill(sample[field.type as keyof typeof sample] ?? 'e2e');
    }
  }
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

  const home = await page.goto(`${base}/`);
  const csp = home?.headers()['content-security-policy'] ?? '';
  check(
    'public pages get the site CSP and headers from public/_headers',
    csp.includes("script-src 'self' https://challenges.cloudflare.com") &&
      csp.includes("frame-ancestors 'none'") &&
      !csp.includes("'unsafe-eval'") &&
      home?.headers()['x-content-type-options'] === 'nosniff',
    home?.headers(),
  );
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
  const notice = page.locator('[data-contact-notice="unavailable"]');
  await notice.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
  check(
    'contact page says the form is not available yet',
    (await notice.isVisible()) &&
      !(await page.locator('[data-contact-form]').isVisible()),
  );

  const form = await loadForm();
  check(
    'GET /api/contact/form says the form is not available',
    form.available === false && form.turnstileSiteKey === null,
    form,
  );

  // A failed request for the form shows the email address instead.
  await page.route('**/api/contact/form', (route) => route.abort());
  await page.goto(`${base}/contact/`);
  const failed = page.locator('[data-contact-notice="failed"]');
  await failed.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
  check(
    'contact page shows the email address when the form cannot be loaded',
    (await failed.isVisible()) &&
      (await failed
        .getByRole('link', { name: siteConfig.company.email })
        .isVisible()),
  );
  await page.unroute('**/api/contact/form');
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
  await fillContactForm(page, await loadForm(), 'Rejected Visitor');
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
  const cspViolations: string[] = [];
  page.on('console', (message) => {
    if (/content security policy/i.test(message.text())) {
      cspViolations.push(message.text());
    }
  });
  const definition = await loadForm();
  const picked = pickFields(definition);
  await page.goto(`${base}/contact/`);
  const form = page.locator('[data-contact-form]');
  await form.waitFor({ state: 'visible' });
  check('contact form is shown with test keys', await form.isVisible());
  const rendered = await page
    .locator('[data-contact-fields] [name]')
    .evaluateAll((controls) => [
      ...new Set(controls.map((control) => control.getAttribute('name'))),
    ]);
  check(
    'the form renders the email field and then the fields from the API, in order',
    JSON.stringify(rendered) ===
      JSON.stringify(['email', ...definition.fields.map((field) => field.id)]),
    rendered,
  );
  const honeypot = await page
    .locator('[data-contact-honeypot]')
    .evaluate((input) => ({
      name: input.getAttribute('name'),
      tabindex: input.getAttribute('tabindex'),
      autocomplete: input.getAttribute('autocomplete'),
      ignored: [
        'data-1p-ignore',
        'data-lpignore',
        'data-bwignore',
        'data-form-type',
      ].every((name) => input.hasAttribute(name)),
      hidden: input.parentElement?.getAttribute('aria-hidden'),
      value: (input as HTMLInputElement).value,
    }));
  check(
    'the honeypot is gnw_hp_x, hidden, empty, and opted out of autofill',
    honeypot.name === 'gnw_hp_x' &&
      honeypot.tabindex === '-1' &&
      honeypot.autocomplete === 'off' &&
      honeypot.ignored &&
      honeypot.hidden === 'true' &&
      honeypot.value === '',
    honeypot,
  );
  // The server flags messages sent within 3 seconds of showing the form as
  // suspected spam (spam score `too_fast`). Take as long as a person would.
  const shownAt = Date.now();

  await page.click('[data-contact-form] [type="submit"]');
  check(
    'empty form shows the validation message',
    await page.locator('[data-result="invalid"]').isVisible(),
  );
  // The form takes its messages from the JSON in contact-form.astro, so
  // compare with that, not a fixed text.
  const texts = JSON.parse(
    (await page.locator('[data-contact-texts]').textContent()) ?? '{}',
  ) as { fieldRequired?: string };
  const nameId = `contact-${picked.name.id}`;
  check(
    'empty name shows the field error',
    Boolean(texts.fieldRequired) &&
      (await page.locator(`#${nameId}-error`).textContent()) ===
        texts.fieldRequired &&
      (await page.getAttribute(`#${nameId}`, 'aria-invalid')) === 'true',
  );

  await fillContactForm(page, definition, VISITOR_NAME);
  check(
    'filled fields clear their errors and the summary message',
    (await page.locator(`#${nameId}-error`).isHidden()) &&
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

  await form.locator('[type="submit"]').scrollIntoViewIfNeeded();
  check(
    'the contact aside heading stays in view when scrolled to submit',
    await page.locator('#contact-aside-title').evaluate((heading) => {
      const rect = heading.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= window.innerHeight;
    }),
  );

  await page.click('[data-contact-form] [type="submit"]');
  const sent = page.locator('[data-contact-sent]');
  await sent.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
  check('contact form shows the thank-you message', await sent.isVisible());
  check(
    'the contact page and Turnstile run under the site CSP',
    cspViolations.length === 0,
    cspViolations,
  );

  const rows = await query(
    'SELECT email, fields, form_version, locale, status, suspected_spam, spam_reasons, ip_hash, page_path FROM submissions',
  );
  const row = rows[0];
  const values = JSON.parse(String(row?.fields ?? '{}')) as Record<
    string,
    unknown
  >;
  check(
    'the submission is in D1 with its field values and form version',
    rows.length === 1 &&
      row?.email === 'visitor@example.org' &&
      values[picked.name.id] === VISITOR_NAME &&
      values[picked.select.id] === picked.option.value &&
      String(values[picked.message.id]).startsWith('テーブルの修理') &&
      row.form_version === definition.version &&
      row.locale === 'ja' &&
      row.status === 'unread' &&
      row.suspected_spam === 0 &&
      row.spam_reasons === '[]' &&
      row.page_path === '/contact/',
    rows,
  );
  check(
    'ip_hash is an HMAC, not an IP address',
    /^[0-9a-f]{64}$/.test(String(row?.ip_hash)),
    row?.ip_hash,
  );
  const ipKey = await ipHashKey();
  const localHashes = await Promise.all(
    ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'unknown'].map((ip) =>
      hmacSha256Hex(ipKey, ip),
    ),
  );
  check(
    `ip_hash is keyed with ${E2E_SECRETS === 'legacy' ? 'IP_HASH_SECRET' : 'the key derived from APP_SECRET'}`,
    localHashes.includes(String(row?.ip_hash)),
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
  if (debugDir) {
    await context.tracing.start({ screenshots: true, snapshots: true });
  }
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
  const picked = pickFields(await loadForm());
  const row = page.getByTestId('inquiry-row').filter({ hasText: VISITOR_NAME });
  const registerButton = page.getByRole('button', {
    name: ui('ja', 'admin.setup.registerPasskey'),
  });

  await step(
    page,
    '/admin sends a new site to setup (in Japanese)',
    async () => {
      await page.goto(`${base}/admin`);
      await page.waitForURL(`${base}/admin/setup`);
      await page
        .getByRole('heading', { name: ui('ja', 'admin.setup.title') })
        .waitFor();
    },
  );
  await step(page, `the setup screen asks for ${SETUP_TOKEN_NAME}`, () =>
    page
      .getByText(ui('ja', 'setup.tokenHint', { name: SETUP_TOKEN_NAME }))
      .waitFor(),
  );
  await step(
    page,
    `setup with ${SETUP_TOKEN_NAME} and an ADMIN_EMAILS address`,
    async () => {
      await page.getByLabel(ui('ja', 'admin.setup.token')).fill(SETUP_TOKEN);
      await page.getByLabel(ui('ja', 'admin.setup.email')).fill(ADMIN_EMAIL);
      await page.getByLabel(ui('ja', 'admin.setup.name')).fill('管理者');
      await page
        .getByRole('button', { name: ui('ja', 'setup.continue') })
        .click();
      await registerButton.waitFor();
    },
  );
  await step(page, 'register a passkey', async () => {
    await registerButton.click();
    await page
      .getByRole('heading', { name: ui('ja', 'setup.doneTitle') })
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

  await step(page, 'setup leads to the list with 1 unread', async () => {
    await page
      .getByRole('button', { name: ui('ja', 'setup.goToList') })
      .click();
    await page.waitForURL(`${base}/admin`);
    await page
      .getByTestId('unread-count')
      .getByText(ui('ja', 'admin.unreadCount', { count: 1 }))
      .waitFor();
  });
  await step(page, 'sign out', async () => {
    await page.getByRole('button', { name: ui('ja', 'admin.signOut') }).click();
    await page.waitForURL(`${base}/admin/login`);
    await page
      .getByRole('heading', { name: ui('ja', 'login.title') })
      .waitFor();
  });
  const signedOut = await page.evaluate(
    async () => (await fetch('/api/admin/submissions')).status,
  );
  check(
    'the admin API answers 401 after sign-out',
    signedOut === 401,
    signedOut,
  );

  await step(page, 'sign in with the passkey', async () => {
    await page.getByRole('button', { name: ui('ja', 'admin.signIn') }).click();
    await page.waitForURL(`${base}/admin`);
  });
  await step(
    page,
    'the inquiry from the form is in the list with its message preview',
    async () => {
      await row.waitFor();
      await row.getByText('テーブルの修理について相談したいです。').waitFor();
      await page
        .getByTestId('unread-count')
        .getByText(ui('ja', 'admin.unreadCount', { count: 1 }))
        .waitFor();
    },
  );
  if (screenshotDir) {
    // Let the unread badge finish its color transition.
    await sleep(500);
    await screenshot(page, 'starter-admin-list-ja.png');
  }

  await step(page, 'switch the admin screen to English', async () => {
    await page.getByTestId('language-switch').click();
    await page
      .getByRole('menuitemradio', { name: ui('en', 'language.en') })
      .click();
    // A radio item keeps the menu open.
    await page.keyboard.press('Escape');
    await page.getByRole('menu').waitFor({ state: 'hidden' });
    await page.getByRole('heading', { name: ui('en', 'list.title') }).waitFor();
    await row.waitFor();
  });
  await step(
    page,
    'open the detail, which marks the inquiry read',
    async () => {
      await row.click();
      await page.waitForURL(`${base}/admin/inquiries/${id}`);
      await page.getByRole('heading', { name: VISITOR_NAME }).waitFor();
      await page.getByText('Hello from the end-to-end test.').waitFor();
      for (const field of [picked.message, picked.select]) {
        await page.getByText(field.label.en, { exact: true }).first().waitFor();
      }
      await page
        .getByText(picked.option.label.en, { exact: true })
        .first()
        .waitFor();
      await page
        .getByTestId('read-toggle')
        .getByText(ui('en', 'list.markUnread'))
        .waitFor();
      await page
        .getByTestId('unread-count')
        .getByText(ui('en', 'admin.unreadCount', { count: 0 }))
        .waitFor();
    },
  );
  const statusChanged = page.getByText(ui('en', 'detail.markedUnread'));
  await step(page, 'mark the inquiry unread again', async () => {
    await page.getByTestId('read-toggle').click();
    await statusChanged.waitFor();
    await page
      .getByTestId('unread-count')
      .getByText(ui('en', 'admin.unreadCount', { count: 1 }))
      .waitFor();
  });
  const status = await query(
    `SELECT status FROM submissions WHERE id = '${id}'`,
  );
  check(
    'the unread status is stored in D1',
    status[0]?.status === 'unread',
    status,
  );
  check(
    'no CSP violations or page errors in the admin screen',
    pageErrors.length === 0,
    pageErrors,
  );
  if (screenshotDir) {
    // Wait for the toast to close so it does not cover the page.
    await statusChanged
      .waitFor({ state: 'hidden', timeout: 10_000 })
      .catch(() => {});
    await screenshot(page, 'starter-admin-detail-en.png');
  }
  if (debugDir) {
    await context.tracing.stop({ path: join(debugDir, 'trace.zip') });
  }
  await context.close();
}

async function main(): Promise<void> {
  if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
  if (debugDir) await mkdir(debugDir, { recursive: true });
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
