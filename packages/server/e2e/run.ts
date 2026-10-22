// End-to-end test against `wrangler dev` with local D1 and real Chromium.
//
//   bun run test:e2e
//
// Needs Playwright's Chromium (`bunx playwright install chromium`). Uses port
// 8790 (override with E2E_PORT) and a fresh state directory under
// .wrangler/e2e-state, so it does not touch other local databases.
//
// Covers: contact POST -> row in D1; then the real admin UI: first-admin
// setup with wrong and right input -> passkey registration (CDP virtual
// authenticator) -> sign-out -> passkey sign-in -> list -> detail -> status
// change -> Slack-style deep link while signed out -> language switch ->
// delete with confirmation. Also checks the API rules the UI relies on, and
// that the UI runs under the admin CSP without violations.
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
} from './support.ts';

const stateDir = join(packageDir, '.wrangler/e2e-state');
const port = Number(process.env.E2E_PORT ?? '8790');
const query = (sql: string) => queryDatabase(stateDir, sql);

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
    if (process.env.E2E_DEBUG_DIR && currentPage) {
      const file = join(process.env.E2E_DEBUG_DIR, `${failures}.png`);
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

const contactBody = (token: string, name: string) => ({
  name,
  email: 'visitor@example.org',
  category: 'sales',
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
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ locale: 'en-US' });
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
        .getByRole('heading', { name: 'Create the first admin' })
        .waitFor();
    });
    const submitSetup = async (token: string, email: string) => {
      await page.getByLabel('Setup token').fill(token);
      await page.getByLabel('Email address').fill(email);
      await page.getByRole('button', { name: 'Continue' }).click();
    };
    await step('setup shows the wrong-token error', async () => {
      await submitSetup('wrong-token', ADMIN_EMAIL);
      await page.getByText('The setup token is not correct.').waitFor();
    });
    await step('setup shows the email-not-allowed error', async () => {
      await submitSetup(SETUP_TOKEN, 'other@example.com');
      await page
        .getByText('This email address is not in ADMIN_EMAILS.')
        .waitFor();
    });
    await step('setup accepts the token and an allowed address', async () => {
      await page.getByLabel('Your name').fill('Admin');
      await submitSetup(SETUP_TOKEN, 'Admin@Example.com');
      await page.getByRole('button', { name: 'Register a passkey' }).click();
      await page.getByRole('heading', { name: 'Setup is complete' }).waitFor();
    });
    const credentials = await authenticator.credentials();
    check(
      'authenticator holds one resident credential',
      credentials.length === 1 && credentials[0]?.isResidentCredential === true,
      credentials.length,
    );

    await step('setup leads to the list with the unread count', async () => {
      await page.getByRole('button', { name: 'Open inquiries' }).click();
      await page.waitForURL(`${base}/admin`);
      await page.getByRole('heading', { name: 'Inquiries' }).waitFor();
      await page.getByTestId('unread-count').getByText('1 unread').waitFor();
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
      await page.getByRole('button', { name: 'Sign out' }).click();
      await page.waitForURL(`${base}/admin/login`);
      await page
        .getByRole('heading', { name: 'Sign in to the admin screen' })
        .waitFor();
    });
    await step('the sign-in screen does not link to closed setup', async () => {
      await page.getByText('Only people who registered a passkey').waitFor();
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
        .getByRole('button', { name: 'Sign in with a passkey' })
        .click();
      await page.waitForURL(`${base}/admin`);
    });
    await step('the list shows the inquiry as new', async () => {
      const row = page.getByTestId('inquiry-row').filter({
        hasText: 'E2E Visitor',
      });
      await row.getByText('New').waitFor();
      await row.getByText('Sales', { exact: true }).waitFor();
      await row.getByText('Hello from the end-to-end test.').waitFor();
    });

    await step('a row opens the detail, which marks it read', async () => {
      await page.getByTestId('inquiry-row').first().click();
      await page.waitForURL(`${base}/admin/inquiries/${id}`);
      await page.getByRole('heading', { name: 'E2E Visitor' }).waitFor();
      await page
        .getByTestId('inquiry-body')
        .getByText('Second line.')
        .waitFor();
      await page.getByTestId('status-select').getByText('Read').waitFor();
      await page.getByTestId('unread-count').getByText('0 unread').waitFor();
    });
    await step('status change to Done', async () => {
      await page.getByTestId('status-select').click();
      await page.getByRole('option', { name: 'Done' }).click();
      await page.getByText('Status changed to “Done”.').waitFor();
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
      await page.getByRole('button', { name: 'Back to inquiries' }).click();
      await page.waitForURL(`${base}/admin`);
      await page
        .getByTestId('inquiry-row')
        .filter({ hasText: 'E2E Visitor' })
        .getByText('Done')
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
      await page.getByRole('button', { name: /^Language/ }).click();
      await page.getByRole('menuitemradio', { name: '日本語' }).click();
      await page
        .getByRole('button', { name: 'お問い合わせ一覧に戻る' })
        .waitFor();
      await page.reload();
      await page
        .getByRole('button', { name: 'お問い合わせ一覧に戻る' })
        .waitFor();
      await page.getByText('製品・料金について').first().waitFor();
    });

    await step('delete asks for confirmation, then removes it', async () => {
      await page.getByRole('button', { name: '削除', exact: true }).click();
      const dialog = page.getByRole('alertdialog');
      await dialog.getByText('このお問い合わせを削除しますか？').waitFor();
      await dialog.getByRole('button', { name: '削除する' }).click();
      await page.waitForURL(`${base}/admin`);
      await page.getByText('お問い合わせはまだありません。').waitFor();
    });
    const remaining = await query('SELECT COUNT(*) AS n FROM submissions');
    check('the row is deleted', remaining[0]?.n === 0, remaining);

    const sessions = await query('SELECT ipAddress FROM session');
    check(
      'sessions store no IP address',
      sessions.every((s) => !s.ipAddress),
      sessions,
    );
    check(
      'no CSP violations or page errors in the admin UI',
      cspViolations.length === 0,
      cspViolations,
    );
  } finally {
    await browser.close();
    await server.stop();
  }
  console.log(
    failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`,
  );
  process.exit(failures === 0 ? 0 : 1);
};

await main();
