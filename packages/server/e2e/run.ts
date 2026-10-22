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
// parameters, not-found) -> detail (marks read) -> back to unread from the
// detail -> read and unread from the list, with the view, total, and counts
// following without a reload -> email search -> a honeypot submission in the
// suspected spam view, with its badge and reasons, cleared and set again ->
// Slack-style deep link while signed out -> language switch ->
// delete with confirmation -> the form editor: add a field and remove one,
// save version 2, submit with the new field, see it in the list (column
// toggle) and the detail, see an old submission with its own labels, and
// restore version 1. Also checks the API rules the UI relies on, and that
// the UI runs under the admin CSP without violations.
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

/** The public form, as `GET /api/contact/form` returns it. */
interface PublicForm {
  available: boolean;
  version: number;
  fields: {
    id: string;
    label: { ja: string; en: string };
    options?: { value: string; label: { ja: string; en: string } }[];
  }[];
}

// An option of the built-in category field (migrations/0004).
const SALES = 'sales';

const contactBody = (
  token: string,
  name: string,
  extra: Record<string, string> = {},
  formVersion = 1,
) => ({
  email: 'visitor@example.org',
  fields: {
    f_name: name,
    f_category: SALES,
    f_message: 'Hello from the end-to-end test.\nSecond line.',
    ...extra,
  },
  consent: true,
  formVersion,
  locale: 'en',
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
    const formResponse = await gnw(page, 'call', '/api/contact/form');
    const publicForm = formResponse.body as PublicForm;
    check(
      'the public form is available as version 1',
      publicForm.available === true &&
        publicForm.version === 1 &&
        publicForm.fields.some((field) => field.id === 'f_name'),
      formResponse,
    );
    const salesLabel = publicForm.fields
      .find((field) => field.id === 'f_category')
      ?.options?.find((option) => option.value === SALES)?.label ?? {
      ja: SALES,
      en: SALES,
    };
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
    const trapped = await gnw(page, 'submitContact', {
      ...contactBody('e2e-pass', 'Trap Visitor'),
      email: 'trap@example.org',
      gnw_hp_x: 'filled by a bot',
    });
    check('a filled honeypot gets the same success', trapped.ok, trapped);
    const stored = await query(
      "SELECT id, json_extract(fields, '$.f_name') AS name, status, ip_hash, form_version FROM submissions WHERE suspected_spam = 0 ORDER BY created_at",
    );
    check(
      'exactly one row is in D1 that is not suspected spam, unread',
      stored.length === 1 &&
        stored[0]?.name === 'E2E Visitor' &&
        stored[0]?.status === 'unread' &&
        stored[0]?.form_version === 1,
      stored,
    );
    const spamRows = await query(
      'SELECT id, status, spam_reasons, notified_at FROM submissions WHERE suspected_spam = 1',
    );
    check(
      'the honeypot submission is stored as suspected spam',
      spamRows.length === 1 &&
        spamRows[0]?.status === 'unread' &&
        spamRows[0]?.spam_reasons === '["honeypot"]' &&
        spamRows[0]?.notified_at === null,
      spamRows,
    );
    const spamId = String(spamRows[0]?.id);
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
    await step('the list shows the inquiry as unread', async () => {
      const row = page.getByTestId('inquiry-row').filter({
        hasText: 'E2E Visitor',
      });
      await row.locator('[data-status="unread"]').waitFor();
      await row.getByText('Hello from the end-to-end test.').waitFor();
    });
    await step('suspected spam is left out, with a hint', async () => {
      await page.getByTestId('spam-hint').waitFor();
      await page.getByTestId('view-count-spam').getByText('1').waitFor();
      const rows = await page.getByTestId('inquiry-row').count();
      if (rows !== 1) throw new Error(`expected 1 row, got ${rows}`);
    });

    await step('an invalid list URL falls back to the defaults', async () => {
      await page.goto(`${base}/admin?view=held&page=abc&sort=email`);
      await page
        .getByRole('tab', { name: ui('en', 'list.view.all'), selected: true })
        .waitFor();
      await page.getByTestId('inquiry-row').first().waitFor();
    });
    await step('the view tab is kept in the URL', async () => {
      await page
        .getByRole('tab', {
          name: new RegExp(`^${ui('en', 'list.view.unread')}`),
        })
        .click();
      await page.waitForURL(`${base}/admin?view=unread`);
      await page.getByTestId('inquiry-row').first().waitFor();
    });
    await step('the received column switches to oldest first', async () => {
      await page.getByTestId('sort-received').click();
      await page.waitForURL(`${base}/admin?view=unread&dir=asc`);
      await page.locator('th[aria-sort="ascending"]').waitFor();
      await page.goto(`${base}/admin`);
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
        .getByTestId('read-toggle')
        .getByText(ui('en', 'list.markUnread'))
        .waitFor();
      await page
        .getByTestId('unread-count')
        .getByText(ui('en', 'admin.unreadCount', { count: 0 }))
        .waitFor();
    });
    await step('the detail sets it back to unread', async () => {
      await page.getByTestId('read-toggle').click();
      await page.getByText(ui('en', 'detail.markedUnread')).waitFor();
      await page
        .getByTestId('unread-count')
        .getByText(ui('en', 'admin.unreadCount', { count: 1 }))
        .waitFor();
    });
    const afterChange = await query(
      `SELECT status, read_at FROM submissions WHERE id = '${id}'`,
    );
    check(
      'unread is stored and read_at is cleared',
      afterChange[0]?.status === 'unread' && afterChange[0]?.read_at === null,
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
        .locator('[data-status="unread"]')
        .waitFor();
    });
    await step('a row marked read leaves the unread view', async () => {
      await page.goto(`${base}/admin?view=unread`);
      await page.getByTestId('view-count-unread').getByText('1').waitFor();
      await page
        .getByTestId('inquiry-row')
        .filter({ hasText: 'E2E Visitor' })
        .getByRole('button', { name: ui('en', 'list.markRead') })
        .click();
      await page.getByText(ui('en', 'list.empty.unread')).waitFor();
      await page.getByText(ui('en', 'list.total', { count: 0 })).waitFor();
      await page
        .getByTestId('view-count-unread')
        .waitFor({ state: 'detached' });
      await page
        .getByTestId('unread-count')
        .getByText(ui('en', 'admin.unreadCount', { count: 0 }))
        .waitFor();
    });
    await step(
      'the list toggle updates the counts without a reload',
      async () => {
        await page.goto(`${base}/admin`);
        const row = page
          .getByTestId('inquiry-row')
          .filter({ hasText: 'E2E Visitor' });
        await row.locator('[data-status="read"]').waitFor();
        // Records whether the table was ever replaced by the loading skeleton.
        await page.evaluate(() => {
          const flags = window as unknown as { listEmptied?: boolean };
          flags.listEmptied = false;
          new MutationObserver(() => {
            if (!document.querySelector('[data-testid="inquiry-row"]')) {
              flags.listEmptied = true;
            }
          }).observe(document.body, { childList: true, subtree: true });
        });
        await row
          .getByRole('button', { name: ui('en', 'list.markUnread') })
          .click();
        await page.getByTestId('view-count-unread').getByText('1').waitFor();
        await row
          .getByRole('button', { name: ui('en', 'list.markRead') })
          .click();
        await page
          .getByTestId('view-count-unread')
          .waitFor({ state: 'detached' });
        await row.locator('[data-status="read"]').waitFor();
        const emptied = await page.evaluate(
          () => (window as unknown as { listEmptied?: boolean }).listEmptied,
        );
        if (emptied !== false) throw new Error('the list flickered');
      },
    );
    const afterRow = await query(
      `SELECT status FROM submissions WHERE id = '${id}'`,
    );
    check(
      'the list toggle is stored',
      afterRow[0]?.status === 'read',
      afterRow,
    );

    await step('the email search matches part of the address', async () => {
      await page.getByTestId('email-search').fill('VISITOR@example');
      await page.getByTestId('email-search').press('Enter');
      await page.waitForURL(`${base}/admin?q=VISITOR%40example`);
      await page.getByTestId('inquiry-row').first().waitFor();
      await page.getByTestId('email-search').fill('nobody@');
      await page.getByTestId('email-search').press('Enter');
      await page.getByText(ui('en', 'list.emptyFiltered')).waitFor();
      await page
        .getByRole('button', { name: ui('en', 'list.search.clear') })
        .click();
      await page.waitForURL(`${base}/admin`);
    });

    await step('the suspected spam view lists the honeypot row', async () => {
      await page
        .getByRole('tab', {
          name: new RegExp(`^${ui('en', 'list.view.spam')}`),
        })
        .click();
      await page.waitForURL(`${base}/admin?view=spam`);
      await page.getByTestId('spam-view-hint').waitFor();
      const row = page
        .getByTestId('inquiry-row')
        .filter({ hasText: 'trap@example.org' });
      await row.getByTestId('suspected-spam-badge').waitFor();
      await row.click();
      await page.waitForURL(`${base}/admin/inquiries/${spamId}`);
      await page
        .getByTestId('spam-notice')
        .getByText(ui('en', 'spam.reason.honeypot'))
        .waitFor();
    });
    await step('Not spam and Mark as spam switch the flag', async () => {
      await page
        .getByRole('button', { name: ui('en', 'detail.notSpam') })
        .click();
      await page.getByText(ui('en', 'detail.notSpamDone')).waitFor();
      const cleared = await query(
        `SELECT suspected_spam FROM submissions WHERE id = '${spamId}'`,
      );
      if (cleared[0]?.suspected_spam !== 0) throw new Error('not cleared');
      await page
        .getByRole('button', { name: ui('en', 'detail.markSpam') })
        .click();
      await page.getByText(ui('en', 'detail.markSpamDone')).waitFor();
      const flagged = await query(
        `SELECT suspected_spam FROM submissions WHERE id = '${spamId}'`,
      );
      if (flagged[0]?.suspected_spam !== 1) throw new Error('not flagged');
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
      await page.getByText(salesLabel.ja).first().waitFor();
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
    const remaining = await query(
      `SELECT COUNT(*) AS n FROM submissions WHERE id = '${id}'`,
    );
    check('the row is deleted', remaining[0]?.n === 0, remaining);

    // The form editor (the UI is in Japanese now). A version 1 submission
    // first, to check later that it keeps its own labels.
    await openTestPage();
    const v1 = await gnw(
      page,
      'submitContact',
      contactBody('e2e-pass', 'V1 Visitor', { f_company: 'Old Company' }),
    );
    check('a version 1 submission with a company succeeds', v1.ok, v1);
    const companyLabel =
      publicForm.fields.find((field) => field.id === 'f_company')?.label.ja ??
      'f_company';

    await step('the header links to the form editor', async () => {
      await page.goto(`${base}/admin`);
      await page.getByTestId('nav-form').click();
      await page.waitForURL(`${base}/admin/form`);
      await page
        .getByRole('heading', { name: ui('ja', 'form.title'), level: 1 })
        .waitFor();
      await page.getByText(ui('ja', 'form.emailNote')).waitFor();
    });
    await step('add a field and fill in its labels', async () => {
      await page.getByTestId('form-add-field').click();
      await page.getByLabel(ui('ja', 'form.labelJa')).last().fill('ご予算');
      await page.getByLabel(ui('ja', 'form.labelEn')).last().fill('Budget');
      await page.getByTestId('form-preview').getByText('ご予算').waitFor();
      await page
        .getByTestId('form-dirty')
        .getByText(ui('ja', 'form.unsaved'))
        .waitFor();
    });
    await step('remove the company field; it moves to archived', async () => {
      await page
        .getByTestId('form-field-card')
        .filter({ hasText: companyLabel })
        .getByRole('button', { name: companyLabel })
        .first()
        .click();
      await page
        .getByRole('button', {
          name: ui('ja', 'form.removeLabel', { label: companyLabel }),
        })
        .click();
      await page.getByTestId('form-archived').getByText(companyLabel).waitFor();
    });
    await step('save creates version 2', async () => {
      await page.getByTestId('form-save').click();
      await page.getByText(ui('ja', 'form.saved', { version: 2 })).waitFor();
      await page
        .getByTestId('form-history')
        .getByText(ui('ja', 'form.version', { version: 2 }))
        .waitFor();
    });
    const versions = await query(
      'SELECT version, created_by FROM form_definitions ORDER BY version',
    );
    check(
      'version 2 is stored with the admin who saved it',
      versions.length === 2 && versions[1]?.created_by === ADMIN_EMAIL,
      versions,
    );

    await openTestPage();
    // The public form is cached for 30 seconds; skip the browser cache like
    // the starter does after `form_outdated`.
    const v2Form = (
      await gnw(page, 'call', '/api/contact/form', { cache: 'no-cache' })
    ).body as PublicForm;
    const budget = v2Form.fields.find((field) => field.label.en === 'Budget');
    check(
      'the public form serves version 2 with the new field',
      v2Form.version === 2 &&
        budget !== undefined &&
        /^f_[a-z0-9]+$/.test(budget.id) &&
        !v2Form.fields.some((field) => field.id === 'f_company'),
      v2Form,
    );
    const budgetId = budget?.id ?? 'f_missing';
    const v2 = await gnw(
      page,
      'submitContact',
      contactBody('e2e-pass', 'V2 Visitor', { [budgetId]: '500万円' }, 2),
    );
    check('a submission with the new field succeeds', v2.ok, v2);
    const outdated = await gnw(
      page,
      'submitContact',
      contactBody('e2e-pass', 'Late Visitor', {}, 1),
    );
    check(
      'a submission for the old version is refused as outdated',
      outdated.code === 'form_outdated',
      outdated,
    );
    const v2Rows = await query(
      `SELECT id, form_version, json_extract(fields, '$.${budgetId}') AS budget FROM submissions WHERE json_extract(fields, '$.f_name') = 'V2 Visitor'`,
    );
    check(
      'the new value is stored under the field id with version 2',
      v2Rows.length === 1 &&
        v2Rows[0]?.form_version === 2 &&
        v2Rows[0]?.budget === '500万円',
      v2Rows,
    );
    const csvEn = await gnw(page, 'call', '/api/admin/submissions.csv?lang=en');
    check(
      'the CSV has a column for the new field and the archived one',
      csvEn.status === 200 &&
        String(csvEn.body).includes('"Budget"') &&
        String(csvEn.body).includes('(v1)') &&
        String(csvEn.body).includes('500万円'),
      String(csvEn.body).split('\r\n')[0],
    );

    await step('the new field can be shown as a list column', async () => {
      await page.goto(`${base}/admin`);
      const row = page
        .getByTestId('inquiry-row')
        .filter({ hasText: 'V2 Visitor' });
      await row.waitFor();
      if (await row.getByText('500万円').count()) {
        throw new Error('the new field is shown although showInList is off');
      }
      await page.getByTestId('columns-menu').click();
      await page.getByRole('menuitemcheckbox', { name: 'ご予算' }).click();
      await page.keyboard.press('Escape');
      await row.getByText('500万円').waitFor();
      await page.reload();
      await page
        .getByTestId('inquiry-row')
        .filter({ hasText: 'V2 Visitor' })
        .getByText('500万円')
        .waitFor();
    });
    await step('a table wider than the page scrolls sideways', async () => {
      await page.setViewportSize({ width: 900, height: 720 });
      const region = page.getByRole('region', {
        name: ui('ja', 'list.tableRegion'),
      });
      const more = page.getByTestId('inquiry-table-more');
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-testid="inquiry-table-more"]')
            ?.getAttribute('data-visible') === 'true',
      );
      if ((await region.getAttribute('tabindex')) !== '0') {
        throw new Error('the scrollable table cannot be reached by keyboard');
      }
      await region.evaluate((element) => {
        element.scrollLeft = element.scrollWidth;
      });
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-testid="inquiry-table-more"]')
            ?.getAttribute('data-visible') === 'false',
      );
      if ((await more.getAttribute('aria-hidden')) !== 'true') {
        throw new Error('the scroll hint is exposed to assistive technology');
      }
      await page.setViewportSize({ width: 1280, height: 720 });
    });
    await step('the detail shows the new field with its label', async () => {
      await page
        .getByTestId('inquiry-row')
        .filter({ hasText: 'V2 Visitor' })
        .click();
      await page.getByRole('heading', { name: 'V2 Visitor' }).waitFor();
      const answer = page.locator(`[data-field-id="${budgetId}"]`);
      await answer.getByText('ご予算').waitFor();
      await answer.getByText('500万円').waitFor();
    });
    await step('an old submission keeps its own labels', async () => {
      await page.goto(`${base}/admin`);
      await page
        .getByTestId('inquiry-row')
        .filter({ hasText: 'V1 Visitor' })
        .click();
      await page.getByRole('heading', { name: 'V1 Visitor' }).waitFor();
      await page
        .getByText(ui('ja', 'detail.oldVersion', { version: 1 }))
        .waitFor();
      const company = page.locator('[data-field-id="f_company"]');
      await company.getByText(companyLabel).waitFor();
      await company.getByText('Old Company').waitFor();
      await company
        .getByText(ui('ja', 'detail.archivedField', { version: 1 }))
        .waitFor();
    });
    await step('restoring version 1 saves it as version 3', async () => {
      await page.goto(`${base}/admin/form`);
      await page
        .getByRole('button', {
          name: ui('ja', 'form.restoreLabel', { version: 1 }),
        })
        .click();
      const dialog = page.getByRole('alertdialog');
      await dialog
        .getByText(ui('ja', 'form.restoreTitle', { version: 1 }))
        .waitFor();
      await dialog
        .getByRole('button', { name: ui('ja', 'form.restore'), exact: true })
        .click();
      await page
        .getByText(ui('ja', 'form.restored', { version: 1, next: 3 }))
        .waitFor();
      await page.getByTestId('form-archived').getByText('ご予算').waitFor();
    });
    await openTestPage();
    // The public form is cached for 30 seconds; skip the browser cache like
    // the starter does after `form_outdated`.
    const v3Form = (
      await gnw(page, 'call', '/api/contact/form', { cache: 'no-cache' })
    ).body as PublicForm;
    check(
      'version 3 has the company field back with its id, and no budget',
      v3Form.version === 3 &&
        v3Form.fields.some((field) => field.id === 'f_company') &&
        !v3Form.fields.some((field) => field.id === budgetId),
      v3Form,
    );

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
