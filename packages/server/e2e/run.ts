// End-to-end test against `wrangler dev` with local D1 and real Chromium.
//
//   bun run test:e2e
//
// Needs Playwright's Chromium (`bunx playwright install chromium`). Uses port
// 8790 (override with E2E_PORT) and a fresh state directory under
// .wrangler/e2e-state, so it does not touch other local databases. Set
// E2E_DEBUG_DIR to save a screenshot of each failed step and a Playwright
// trace (trace.zip, open it with `bunx playwright show-trace`).
//
// Covers: contact POST -> row in D1; then the real admin UI: first-admin
// setup with empty, wrong, and right input -> passkey registration (CDP
// virtual authenticator) -> sign-out -> passkey sign-in -> list (URL search
// parameters, not-found) -> detail -> status
// change -> Slack-style deep link while signed out -> language switch ->
// light/dark switch -> delete with confirmation. Also checks the API rules the UI relies on, and
// that the UI runs under the admin CSP without violations.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';
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
import { e2eCategories } from './categories.ts';

const stateDir = join(packageDir, '.wrangler/e2e-state');
const port = Number(process.env.E2E_PORT ?? '8790');
const query = (sql: string) => queryDatabase(stateDir, sql);
const debugDir = process.env.E2E_DEBUG_DIR;

let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (!ok) failures++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${name}${ok || detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`,
  );
};

let currentPage: Page | null = null;

/** Runs a UI step; a timeout or a missing element counts as a failure. */
const step = async (name: string, action: () => Promise<unknown>) => {
  try {
    await action();
    check(name, true);
  } catch (error) {
    check(name, false, error instanceof Error ? error.message : String(error));
    if (debugDir && currentPage) {
      const file = join(debugDir, `${failures}.png`);
      await currentPage.screenshot({ path: file, fullPage: true });
      console.log(`  url: ${currentPage.url()} screenshot: ${file}`);
    }
  }
};

type Gnw = {
  call: (
    path: string,
    init?: RequestInit,
  ) => Promise<{
    status: number;
    body: unknown;
    headers: Record<string, string>;
  }>;
  submitContact: (input: unknown) => Promise<{ ok: boolean; code?: string }>;
  setup: (
    token: string,
    email: string,
    name: string,
  ) => Promise<{ status: number; body: unknown }>;
  signOut: () => Promise<unknown>;
};

/** Calls a helper from e2e/client/app.ts in the test page. */
const gnw = <K extends keyof Gnw>(
  page: Page,
  name: K,
  ...args: Parameters<Gnw[K]>
): Promise<Awaited<ReturnType<Gnw[K]>>> =>
  page.evaluate(
    ([fn, fnArgs]) =>
      (
        (
          window as unknown as {
            gnw: Record<string, (...a: unknown[]) => unknown>;
          }
        ).gnw[fn as string] as (...a: unknown[]) => Promise<never>
      )(...(fnArgs as unknown[])),
    [name, args] as const,
  ) as Promise<Awaited<ReturnType<Gnw[K]>>>;

const [sales] = e2eCategories;

const contactBody = (token: string, name: string) => ({
  name,
  email: 'visitor@example.org',
  category: sales.value,
  message: 'Hello from the end-to-end test.\nSecond line.',
  consent: true,
  turnstileToken: token,
  elapsedMs: 15_000,
  pagePath: '/contact',
});

const main = async () => {
  await buildPackage();
  const build = await Bun.build({
    entrypoints: [join(packageDir, 'e2e/client/app.ts')],
    outdir: join(packageDir, 'e2e/public'),
    target: 'browser',
    minify: true,
  });
  if (!build.success) throw new Error(build.logs.join('\n'));
  await freshDatabase(stateDir);

  const server = await startDevServer({ port, stateDir, vars: testVars });
  const { base } = server;
  if (debugDir) await mkdir(debugDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'en-US' });
  if (debugDir) {
    await context.tracing.start({ screenshots: true, snapshots: true });
  }
  try {
    const page = await context.newPage();
    currentPage = page;
    const authenticator = await addVirtualAuthenticator(context, page);
    // The virtual authenticator also answers the sign-in screen's autofill
    // request (conditional UI). To test the button, turn autofill off with a
    // flag in localStorage.
    await context.addInitScript(() => {
      if (localStorage.getItem('e2e-no-autofill') === '1') {
        PublicKeyCredential.isConditionalMediationAvailable = async () => false;
      }
    });
    const setAutofill = (on: boolean) =>
      page.evaluate((value) => {
        if (value) localStorage.removeItem('e2e-no-autofill');
        else localStorage.setItem('e2e-no-autofill', '1');
      }, on);
    const cspViolations: string[] = [];
    page.on('console', (message) => {
      if (/content security policy/i.test(message.text())) {
        cspViolations.push(message.text());
      }
    });
    page.on('pageerror', (error) => cspViolations.push(error.message));

    // A test page (not the admin UI) with helpers for API calls.
    const openTestPage = async () => {
      await page.goto(`${base}/`);
      await page.waitForSelector('body[data-ready="true"]');
    };
    await openTestPage();

    // Contact form API.
    const config = await gnw(page, 'call', '/api/contact/config');
    check(
      'contact config is available',
      (config.body as { available?: boolean }).available === true,
      config,
    );
    const sent = await gnw(
      page,
      'submitContact',
      contactBody('e2e-pass', 'E2E Visitor'),
    );
    check('contact POST succeeds', sent.ok === true, sent);
    const rejected = await gnw(
      page,
      'submitContact',
      contactBody('e2e-fail', 'Rejected Visitor'),
    );
    check(
      'contact POST with a failing Turnstile token is rejected',
      rejected.code === 'turnstile_failed',
      rejected,
    );
    const stored = await query(
      'SELECT id, name, status, ip_hash FROM submissions ORDER BY created_at',
    );
    check(
      'exactly one row is in D1 with status new',
      stored.length === 1 &&
        stored[0]?.name === 'E2E Visitor' &&
        stored[0]?.status === 'new',
      stored,
    );
    check(
      'ip_hash is an HMAC, not an IP',
      /^[0-9a-f]{64}$/.test(String(stored[0]?.ip_hash)),
      stored[0]?.ip_hash,
    );
    const id = String(stored[0]?.id);
    const before = await gnw(page, 'call', '/api/admin/submissions');
    check('admin list is 401 before sign-in', before.status === 401, before);

    // Setup through the admin UI.
    await step('/admin sends a new site to setup', async () => {
      await page.goto(`${base}/admin`);
      await page.waitForURL(`${base}/admin/setup`);
      await page
        .getByRole('heading', { name: ui('en', 'admin.setup.title') })
        .waitFor();
    });
    const submitSetup = async (token: string, email: string) => {
      await page.getByLabel(ui('en', 'admin.setup.token')).fill(token);
      await page.getByLabel(ui('en', 'admin.setup.email')).fill(email);
      await page
        .getByRole('button', { name: ui('en', 'setup.continue') })
        .click();
    };
    await step('setup checks the fields before sending', async () => {
      await page
        .getByRole('button', { name: ui('en', 'setup.continue') })
        .click();
      await page.getByText(ui('en', 'field.required')).nth(1).waitFor();
      await page
        .getByLabel(ui('en', 'admin.setup.email'))
        .fill('not-an-address');
      await page.getByText(ui('en', 'field.invalid')).waitFor();
      await page.getByLabel(ui('en', 'admin.setup.email')).fill('');
    });
    await step('setup shows the wrong-token error', async () => {
      await submitSetup('wrong-token', ADMIN_EMAIL);
      await page.getByText(ui('en', 'error.invalid_setup_token')).waitFor();
    });
    await step('setup shows the email-not-allowed error', async () => {
      await submitSetup(SETUP_TOKEN, 'other@example.com');
      await page.getByText(ui('en', 'error.email_not_allowed')).waitFor();
    });
    await step('setup accepts the token and an allowed address', async () => {
      await page.getByLabel(ui('en', 'admin.setup.name')).fill('Admin');
      await submitSetup(SETUP_TOKEN, 'Admin@Example.com');
      await page
        .getByRole('button', { name: ui('en', 'admin.setup.registerPasskey') })
        .click();
      await page
        .getByRole('heading', { name: ui('en', 'setup.doneTitle') })
        .waitFor();
    });
    const credentials = await authenticator.credentials();
    check(
      'authenticator holds one resident credential',
      credentials.length === 1 && credentials[0]?.isResidentCredential === true,
      credentials.length,
    );

    await step('setup leads to the list with the unread count', async () => {
      await page
        .getByRole('button', { name: ui('en', 'setup.goToList') })
        .click();
      await page.waitForURL(`${base}/admin`);
      await page
        .getByRole('heading', { name: ui('en', 'list.title') })
        .waitFor();
      await page
        .getByTestId('unread-count')
        .getByText(ui('en', 'admin.unreadCount', { count: 1 }))
        .waitFor();
    });
    await step('Slack is optional: only a quiet note', async () => {
      await page.getByTestId('slack-notice').waitFor();
      if (await page.getByTestId('turnstile-notice').count()) {
        throw new Error('Turnstile notice shown although it is configured');
      }
    });

    await step('sign-out returns to the sign-in screen', async () => {
      // The flag applies from the next page load.
      await setAutofill(false);
      await page.reload();
      await page
        .getByRole('button', { name: ui('en', 'admin.signOut') })
        .click();
      await page.waitForURL(`${base}/admin/login`);
      await page
        .getByRole('heading', { name: ui('en', 'login.title') })
        .waitFor();
    });
    await step('the sign-in screen does not link to closed setup', async () => {
      await page.getByText(ui('en', 'login.setupNote')).waitFor();
      if (await page.getByTestId('setup-open').count()) {
        throw new Error('setup link shown after setup closed');
      }
    });
    const signedOut = await page.evaluate(async () => {
      const response = await fetch('/api/admin/submissions');
      return response.status;
    });
    check('admin list is 401 after sign-out', signedOut === 401, signedOut);

    await step('passkey sign-in with the button opens the list', async () => {
      await page
        .getByRole('button', { name: ui('en', 'admin.signIn') })
        .click();
      await page.waitForURL(`${base}/admin`);
    });
    await step('the list shows the inquiry as new', async () => {
      const row = page.getByTestId('inquiry-row').filter({
        hasText: 'E2E Visitor',
      });
      await row.getByText(ui('en', 'status.new')).waitFor();
      await row.getByText(sales.label.en, { exact: true }).waitFor();
      await row.getByText('Hello from the end-to-end test.').waitFor();
    });

    await step('an invalid list URL falls back to the defaults', async () => {
      await page.goto(`${base}/admin?status=deleted&page=abc`);
      await page
        .getByRole('tab', { name: ui('en', 'list.filter.all'), selected: true })
        .waitFor();
      await page.getByTestId('inquiry-row').first().waitFor();
    });
    await step('the status tab is kept in the URL', async () => {
      await page.getByRole('tab', { name: ui('en', 'status.new') }).click();
      await page.waitForURL(`${base}/admin?status=new`);
      await page.getByTestId('inquiry-row').first().waitFor();
    });
    await step('an unknown admin path shows not found', async () => {
      await page.goto(`${base}/admin/nope`);
      await page
        .getByRole('heading', { name: ui('en', 'app.notFound.title') })
        .waitFor();
      await page
        .getByRole('link', { name: ui('en', 'app.backToList') })
        .click();
      await page.waitForURL(`${base}/admin`);
    });

    await step('a row opens the detail, which marks it read', async () => {
      await page.getByTestId('inquiry-row').first().click();
      await page.waitForURL(`${base}/admin/inquiries/${id}`);
      await page.getByRole('heading', { name: 'E2E Visitor' }).waitFor();
      await page
        .getByTestId('inquiry-body')
        .getByText('Second line.')
        .waitFor();
      await page
        .getByTestId('status-select')
        .getByText(ui('en', 'status.read'))
        .waitFor();
      await page
        .getByTestId('unread-count')
        .getByText(ui('en', 'admin.unreadCount', { count: 0 }))
        .waitFor();
    });
    await step('status change to Done', async () => {
      await page.getByTestId('status-select').click();
      await page.getByRole('option', { name: ui('en', 'status.done') }).click();
      await page
        .getByText(
          ui('en', 'detail.statusChanged', { status: ui('en', 'status.done') }),
        )
        .waitFor();
    });
    const afterChange = await query(
      `SELECT status FROM submissions WHERE id = '${id}'`,
    );
    check(
      'the new status is stored',
      afterChange[0]?.status === 'done',
      afterChange,
    );
    await step('back to the list keeps working', async () => {
      await page
        .getByRole('button', { name: ui('en', 'app.backToList') })
        .click();
      await page.waitForURL(`${base}/admin`);
      await page
        .getByTestId('inquiry-row')
        .filter({ hasText: 'E2E Visitor' })
        .getByText(ui('en', 'status.done'))
        .waitFor();
    });

    // API rules that the UI relies on.
    await openTestPage();
    const closed = await gnw(page, 'setup', SETUP_TOKEN, ADMIN_EMAIL, 'Admin');
    check(
      'setup is closed once a passkey exists',
      closed.status === 403,
      closed,
    );
    const closedFlag = await query(
      "SELECT 1 AS found FROM settings WHERE key = 'setup_closed_at'",
    );
    check(
      'the passkey insert recorded setup_closed_at',
      closedFlag.length === 1,
      closedFlag,
    );
    const csv = await gnw(page, 'call', '/api/admin/submissions.csv');
    check(
      'CSV export',
      csv.status === 200 && String(csv.body).includes('E2E Visitor'),
      csv.status,
    );
    const status = await gnw(page, 'call', '/api/admin/status');
    check(
      'admin status',
      (status.body as { turnstileConfigured?: boolean }).turnstileConfigured ===
        true,
      status,
    );
    const shell = await gnw(page, 'call', `/admin/inquiries/${id}`);
    check(
      'admin UI deep link is served with the CSP',
      shell.status === 200 &&
        String(shell.body).includes('/admin/assets/') &&
        (shell.headers['content-security-policy'] ?? '').includes(
          "script-src 'self'",
        ),
      shell.status,
    );

    // The link in a Slack notification, opened while signed out.
    // This time sign in through the passkey autofill (conditional UI).
    await gnw(page, 'signOut');
    await setAutofill(true);
    await step(
      'a deep link while signed out goes through sign-in',
      async () => {
        await page.goto(`${base}/admin/inquiries/${id}`);
        await page.waitForURL(/\/admin\/login\?next=/);
        await page.waitForURL(`${base}/admin/inquiries/${id}`);
        await page.getByRole('heading', { name: 'E2E Visitor' }).waitFor();
      },
    );

    await step('language switch to Japanese is kept after reload', async () => {
      await page.getByTestId('language-switch').click();
      await page
        .getByRole('menuitemradio', { name: ui('ja', 'language.ja') })
        .click();
      await page
        .getByRole('button', { name: ui('ja', 'app.backToList') })
        .waitFor();
      await page.reload();
      await page
        .getByRole('button', { name: ui('ja', 'app.backToList') })
        .waitFor();
      await page.getByText(sales.label.ja).first().waitFor();
    });

    // The class on <html> when #root is parsed: theme-init.js has run, the
    // app has not. Shows that the first paint already has the right colors.
    await context.addInitScript(() => {
      new MutationObserver((_, observer) => {
        if (!document.getElementById('root')) return;
        document.documentElement.dataset.e2eDarkAtParse = String(
          document.documentElement.classList.contains('dark'),
        );
        observer.disconnect();
      }).observe(document, { childList: true, subtree: true });
    });
    const darkClass = () =>
      page.evaluate(() => ({
        now: document.documentElement.classList.contains('dark'),
        atParse: document.documentElement.dataset.e2eDarkAtParse,
      }));

    await step('the theme follows the system setting by default', async () => {
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.reload();
      await page.getByTestId('theme-switch').waitFor();
      const dark = await darkClass();
      if (!dark.now || dark.atParse !== 'true') {
        throw new Error(`expected dark: ${JSON.stringify(dark)}`);
      }
      await page.emulateMedia({ colorScheme: 'light' });
      await page.waitForFunction(
        () => !document.documentElement.classList.contains('dark'),
      );
    });

    await step(
      'the dark choice is kept after reload, before render',
      async () => {
        await page.getByTestId('theme-switch').click();
        await page
          .getByRole('menuitemradio', { name: ui('ja', 'theme.dark') })
          .click();
        await page.waitForFunction(() =>
          document.documentElement.classList.contains('dark'),
        );
        await page
          .getByRole('button', {
            name: `${ui('ja', 'theme.label')}: ${ui('ja', 'theme.dark')}`,
          })
          .waitFor();
        await page.reload();
        await page.getByTestId('theme-switch').waitFor();
        const dark = await darkClass();
        if (!dark.now || dark.atParse !== 'true') {
          throw new Error(`expected dark: ${JSON.stringify(dark)}`);
        }
      },
    );

    await step('back to the system setting', async () => {
      await page.getByTestId('theme-switch').click();
      await page
        .getByRole('menuitemradio', { name: ui('ja', 'theme.system') })
        .click();
      await page.waitForFunction(
        () => !document.documentElement.classList.contains('dark'),
      );
      const stored = await page.evaluate(() =>
        localStorage.getItem('goodnight-web.admin.theme'),
      );
      if (stored !== 'system') throw new Error(`stored ${stored}`);
    });

    await step('delete asks for confirmation, then removes it', async () => {
      await page
        .getByRole('button', { name: ui('ja', 'admin.delete'), exact: true })
        .click();
      const dialog = page.getByRole('alertdialog');
      await dialog.getByText(ui('ja', 'detail.deleteTitle')).waitFor();
      await dialog
        .getByRole('button', { name: ui('ja', 'detail.deleteConfirm') })
        .click();
      await page.waitForURL(`${base}/admin`);
      await page.getByText(ui('ja', 'admin.empty')).waitFor();
    });
    const remaining = await query('SELECT COUNT(*) AS n FROM submissions');
    check('the row is deleted', remaining[0]?.n === 0, remaining);

    const sessions = await query('SELECT ip_address FROM session');
    check(
      'sessions store no IP address',
      sessions.every((s) => !s.ip_address),
      sessions,
    );
    check(
      'no CSP violations or page errors in the admin UI',
      cspViolations.length === 0,
      cspViolations,
    );
  } finally {
    if (debugDir) {
      await context.tracing.stop({ path: join(debugDir, 'trace.zip') });
    }
    await browser.close();
    await server.stop();
  }
  console.log(
    failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`,
  );
  process.exit(failures === 0 ? 0 : 1);
};

await main();
