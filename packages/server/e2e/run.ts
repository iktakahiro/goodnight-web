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
// Slack-style deep link while signed out -> language switch -> light/dark
// switch -> delete with confirmation -> the form editor: open every saved
// field, discard a change, add a field and remove one, save version 2, submit
// with the new field, see it in the list (column toggle) and the detail, see
// an old submission with its own labels, and restore version 1. Also checks
// the API rules the UI relies on (such as the /api/auth body cap), and that
// the UI runs under the admin CSP without violations.
//
// E2E_SECRETS picks the secrets (see support.ts): `app-secret` (default)
// runs everything with APP_SECRET and ADMIN_EMAILS only, then starts the
// Worker again with an APP_SECRET of 31 characters and checks that setup,
// sign-in, and the contact API stay off and the setup screen names
// APP_SECRET. `legacy` runs with the four variables.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import {
  APP_SECRET_LABELS,
  deriveAppSecretKey,
} from '../src/shared/app-secret.ts';
import { hmacSha256Hex } from '../src/shared/crypto.ts';
import { MIN_SECRET_LENGTH } from '../src/shared/secret-length.ts';
import {
  ADMIN_EMAIL,
  APP_SECRET,
  E2E_SECRETS,
  SETUP_TOKEN,
  SETUP_TOKEN_NAME,
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

/**
 * Starts the Worker with an APP_SECRET of 31 characters and no other secret:
 * nothing is derived, so setup, sign-in, and the contact API answer 503 and
 * the setup screen names APP_SECRET as too short. Nothing is stored.
 */
const checkShortAppSecret = async () => {
  const shortStateDir = join(packageDir, '.wrangler/e2e-state-short');
  const shortQuery = (sql: string) => queryDatabase(shortStateDir, sql);
  await freshDatabase(shortStateDir);
  const server = await startDevServer({
    port,
    stateDir: shortStateDir,
    vars: {
      ...testVars,
      APP_SECRET: APP_SECRET.slice(0, MIN_SECRET_LENGTH - 1),
    },
  });
  const { base } = server;
  const call = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${base}${path}`, init);
    return {
      status: response.status,
      body: (await response.json()) as {
        error?: { code: string; message: string };
      } & Record<string, unknown>,
    };
  };
  const post = (path: string, body: unknown) =>
    call(path, {
      method: 'POST',
      headers: { origin: base, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  let browser: Browser | null = null;
  try {
    const state = await call('/api/setup');
    check(
      'short APP_SECRET: setup reports APP_SECRET too_short only',
      state.status === 200 &&
        state.body.configured === false &&
        JSON.stringify(state.body.problems) ===
          JSON.stringify([{ name: 'APP_SECRET', issue: 'too_short' }]),
      state,
    );
    for (const token of [
      APP_SECRET.slice(0, MIN_SECRET_LENGTH - 1),
      APP_SECRET,
    ]) {
      const setup = await post('/api/setup', {
        token,
        email: ADMIN_EMAIL,
        name: 'Admin',
      });
      check(
        `short APP_SECRET: POST /api/setup is 503 auth_unavailable (${token.length} characters)`,
        setup.status === 503 &&
          setup.body.error?.code === 'auth_unavailable' &&
          setup.body.error.message.includes('APP_SECRET') &&
          !JSON.stringify(setup).includes(token),
        setup,
      );
    }
    const session = await call('/api/auth/get-session');
    const signIn = await post(
      '/api/auth/passkey/generate-authenticate-options',
      {},
    );
    const admin = await call('/api/admin/status');
    check(
      'short APP_SECRET: sign-in and the admin API are 503 auth_unavailable',
      [session, signIn, admin].every(
        (r) => r.status === 503 && r.body.error?.code === 'auth_unavailable',
      ),
      { session, signIn, admin },
    );
    const contact = await post(
      '/api/contact',
      contactBody('e2e-pass', 'Short'),
    );
    const form = await call('/api/contact/form');
    check(
      'short APP_SECRET: the contact API is 503 contact_unavailable',
      contact.status === 503 &&
        contact.body.error?.code === 'contact_unavailable' &&
        form.body.available === false,
      { contact, form: form.body.available },
    );
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ locale: 'en-US' });
    currentPage = page;
    await step(
      'short APP_SECRET: the setup screen names APP_SECRET',
      async () => {
        await page.goto(`${base}/admin/setup`);
        await page
          .getByRole('heading', { name: ui('en', 'setup.unavailableTitle') })
          .waitFor();
        await page
          .getByTestId('setup-problems')
          .getByText(
            ui('en', 'setup.problemTooShort', {
              name: 'APP_SECRET',
              min: MIN_SECRET_LENGTH,
            }),
          )
          .waitFor();
      },
    );
    const users = await shortQuery('SELECT COUNT(*) AS n FROM user');
    const rows = await shortQuery('SELECT COUNT(*) AS n FROM submissions');
    check(
      'short APP_SECRET: nothing is stored',
      users[0]?.n === 0 && rows[0]?.n === 0,
      { users, rows },
    );
  } finally {
    await browser?.close();
    await server.stop();
  }
};

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
      contactBody('e2e-pass', 'E2E Visitor', {
        f_message:
          'Hello from the end-to-end test.\nSecond line.\n' +
          'More inquiry details to read while keeping the actions in view.\n'.repeat(
            40,
          ),
      }),
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
    // workerd derives the same key as this process: the stored hash is the
    // HMAC of the local client address with IP_HASH_SECRET, or with the key
    // derived from APP_SECRET.
    const ipKey =
      E2E_SECRETS === 'legacy'
        ? (testVars.IP_HASH_SECRET ?? '')
        : await deriveAppSecretKey(
            APP_SECRET,
            APP_SECRET_LABELS.IP_HASH_SECRET,
          );
    const localHashes = await Promise.all(
      ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'unknown'].map((ip) =>
        hmacSha256Hex(ipKey, ip),
      ),
    );
    check(
      `ip_hash is keyed with ${E2E_SECRETS === 'legacy' ? 'IP_HASH_SECRET' : 'the key derived from APP_SECRET'}`,
      localHashes.includes(String(stored[0]?.ip_hash)),
      stored[0]?.ip_hash,
    );
    const id = String(stored[0]?.id);
    const bigAuth = await gnw(
      page,
      'call',
      '/api/auth/passkey/verify-authentication',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ response: 'x'.repeat(70 * 1024) }),
      },
    );
    check(
      'an auth body over 64 KiB gets 413',
      bigAuth.status === 413,
      bigAuth.status,
    );
    const before = await gnw(page, 'call', '/api/admin/submissions');
    check('admin list is 401 before sign-in', before.status === 401, before);

    // Setup through the admin UI.
    await step(
      'a failed setup request shows an error and a retry',
      async () => {
        // Answer the first GET /api/setup with the API's error shape.
        await page.route(
          '**/api/setup',
          (route) =>
            route.fulfill({
              status: 500,
              contentType: 'application/json',
              body: JSON.stringify({
                error: {
                  code: 'server_error',
                  message: ui('en', 'error.server_error'),
                },
              }),
            }),
          { times: 1 },
        );
        await page.goto(`${base}/admin/setup`);
        await page
          .getByRole('heading', { name: ui('en', 'app.errorTitle') })
          .waitFor();
        check(
          'a failed setup request is not reported as not configured',
          (await page.getByText(ui('en', 'setup.unavailableTitle')).count()) ===
            0,
        );
        await page.getByRole('button', { name: ui('en', 'app.retry') }).click();
        await page
          .getByRole('heading', { name: ui('en', 'admin.setup.title') })
          .waitFor();
      },
    );
    await step('/admin sends a new site to setup', async () => {
      await page.goto(`${base}/admin`);
      await page.waitForURL(`${base}/admin/setup`);
      await page
        .getByRole('heading', { name: ui('en', 'admin.setup.title') })
        .waitFor();
    });
    await step(`the setup screen asks for ${SETUP_TOKEN_NAME}`, async () => {
      await page
        .getByText(ui('en', 'setup.tokenHint', { name: SETUP_TOKEN_NAME }))
        .waitFor();
    });
    await step('the favicons and the touch icon are served', async () => {
      for (const [path, type, magic] of [
        ['/admin/favicon.svg', 'image/svg+xml', [0x3c, 0x73, 0x76, 0x67]],
        ['/admin/favicon.ico', 'image/x-icon', [0, 0, 1, 0]],
        ['/admin/apple-touch-icon.png', 'image/png', [0x89, 0x50, 0x4e, 0x47]],
      ] as const) {
        const response = await page.request.get(`${base}${path}`);
        const head = [...(await response.body()).subarray(0, 4)];
        check(
          `${path} is served as ${type}`,
          response.status() === 200 &&
            response.headers()['content-type'] === type &&
            magic.every((byte, i) => head[i] === byte),
          {
            status: response.status(),
            type: response.headers()['content-type'],
            head,
          },
        );
      }
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
    await step('an invalid Slack URL shows a warning instead', async () => {
      // The dev server has no SLACK_WEBHOOK_URL, so the status the server
      // would send for an invalid one is stubbed for this step.
      const statusUrl = `${base}/api/admin/status`;
      await page.route(statusUrl, async (route) => {
        const response = await route.fetch();
        const status = await response.json();
        await route.fulfill({
          response,
          json: { ...status, slackConfigured: false, slackInvalid: true },
        });
      });
      try {
        await page.reload();
        const notice = page.getByTestId('slack-invalid-notice');
        await notice.getByText(ui('en', 'notice.slackInvalidTitle')).waitFor();
        if (await page.getByTestId('slack-notice').count()) {
          throw new Error('the quiet Slack note is shown with the warning');
        }
        await notice
          .getByRole('button', { name: ui('en', 'notice.close') })
          .click();
        await notice.waitFor({ state: 'detached' });
        if (await page.getByTestId('slack-notice').count()) {
          throw new Error(
            'the quiet Slack note replaced the dismissed warning',
          );
        }
      } finally {
        await page.unroute(statusUrl);
      }
      await page.reload();
      await page.getByTestId('slack-notice').waitFor();
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

    await step(
      'mobile view tabs reveal the active tab and keep the page position',
      async () => {
        const viewport = page.viewportSize();
        try {
          await page.setViewportSize({ width: 390, height: 844 });
          await page.goto(`${base}/admin?view=spam`);
          const tabs = page.getByRole('tablist', {
            name: ui('en', 'list.filterLabel'),
          });
          const spam = tabs
            .getByRole('tab', { selected: true })
            .and(page.locator('[data-view="spam"]'));
          await spam.getByTestId('view-count-spam').getByText('1').waitFor();
          await page.getByTestId('spam-view-hint').waitFor();
          await page.getByTestId('inquiry-row').first().waitFor();
          await page.waitForFunction(() => {
            const active = document.querySelector(
              '[role="tab"][data-view="spam"][aria-selected="true"]',
            );
            const list = active?.closest('[role="tablist"]');
            const badge = active?.querySelector(
              '[data-testid="view-count-spam"]',
            );
            if (!active || !list || !badge) return false;
            const box = list.getBoundingClientRect();
            const left = box.left + list.clientLeft;
            const right = left + list.clientWidth;
            return [active, badge].every((element) => {
              const bounds = element.getBoundingClientRect();
              return bounds.left >= left && bounds.right <= right;
            });
          });
          await page.evaluate(() =>
            window.scrollTo({ top: 64, behavior: 'instant' }),
          );
          const scrollY = await page.evaluate(() => window.scrollY);
          if (scrollY <= 0)
            throw new Error('the page did not scroll before switching tabs');
          await tabs
            .getByRole('tab')
            .and(page.locator('[data-view="read"]'))
            .click();
          await page.waitForURL(`${base}/admin?view=read`);
          await tabs
            .getByRole('tab', { selected: true })
            .and(page.locator('[data-view="read"]'))
            .waitFor();
          await page
            .getByText(ui('en', 'list.empty.read'), { exact: true })
            .waitFor();
          const after = await page.evaluate(() => window.scrollY);
          if (after <= 0 || Math.abs(after - scrollY) > 1) {
            throw new Error(
              `switching tabs moved the page from ${scrollY} to ${after}`,
            );
          }
        } finally {
          if (viewport) await page.setViewportSize(viewport);
          await page.goto(`${base}/admin`);
        }
      },
    );

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
    await step(
      'desktop detail actions stay in view while reading',
      async () => {
        const viewport = page.viewportSize();
        try {
          await page.setViewportSize({ width: 1280, height: 800 });
          await page.evaluate(() =>
            window.scrollTo({ top: 600, behavior: 'instant' }),
          );
          if ((await page.evaluate(() => window.scrollY)) < 500) {
            throw new Error('the long inquiry did not scroll far enough');
          }
          const reply = page.getByRole('link', {
            name: ui('en', 'detail.reply'),
          });
          const remove = page.getByRole('button', {
            name: ui('en', 'admin.delete'),
            exact: true,
          });
          for (const action of [reply, remove]) {
            const visible = await action.evaluate((element) => {
              const bounds = element.getBoundingClientRect();
              const header = document
                .querySelector('header')
                ?.getBoundingClientRect();
              return (
                bounds.top >= (header?.bottom ?? 0) &&
                bounds.bottom <= window.innerHeight
              );
            });
            if (!visible)
              throw new Error('a detail action scrolled out of view');
          }
        } finally {
          await page.evaluate(() =>
            window.scrollTo({ top: 0, behavior: 'instant' }),
          );
          if (viewport) await page.setViewportSize(viewport);
        }
      },
    );
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
    await step('every saved field opens its settings', async () => {
      // Before any change: the first re-render of an untouched editor used
      // to reset the form in a loop (React error #185).
      const cards = page.getByTestId('form-field-card');
      const count = await cards.count();
      if (count !== publicForm.fields.length) {
        throw new Error(
          `expected ${publicForm.fields.length} fields: ${count}`,
        );
      }
      for (const [index, field] of publicForm.fields.entries()) {
        const card = cards.nth(index);
        const toggle = card.locator('button[aria-controls$="-settings"]');
        await toggle.click();
        await card.getByLabel(ui('ja', 'form.labelJa')).waitFor();
        const label = await card
          .getByLabel(ui('ja', 'form.labelJa'))
          .inputValue();
        if (label !== field.label.ja) {
          throw new Error(`${field.id} shows the label ${label}`);
        }
        await toggle.click();
        await card.getByLabel(ui('ja', 'form.labelJa')).waitFor({
          state: 'detached',
        });
      }
      const crashed = await page
        .getByRole('heading', { name: ui('ja', 'app.errorTitle') })
        .count();
      if (crashed > 0) throw new Error('the editor shows the error screen');
    });
    await step('desktop form preview stays in view while editing', async () => {
      const viewport = page.viewportSize();
      const toggle = page
        .getByTestId('form-field-card')
        .first()
        .locator('button[aria-controls$="-settings"]');
      try {
        await page.setViewportSize({ width: 1280, height: 800 });
        await toggle.click();
        await page.getByLabel(ui('ja', 'form.labelJa')).waitFor();
        await page.evaluate(() =>
          window.scrollTo({
            top: document.documentElement.scrollHeight,
            behavior: 'instant',
          }),
        );
        if ((await page.evaluate(() => window.scrollY)) <= 0) {
          throw new Error('the form editor did not scroll');
        }
        const toolbar = await page
          .getByTestId('form-save')
          .locator('../..')
          .boundingBox();
        if (!toolbar) throw new Error('the form toolbar is missing');
        const visible = await page
          .getByTestId('form-preview-card')
          .getByRole('heading', { name: ui('ja', 'form.previewHeading') })
          .evaluate((element, toolbarBottom) => {
            const bounds = element.getBoundingClientRect();
            return (
              bounds.top >= toolbarBottom && bounds.bottom <= window.innerHeight
            );
          }, toolbar.y + toolbar.height);
        if (!visible) throw new Error('the form preview scrolled out of view');
      } finally {
        await toggle.click();
        await page.evaluate(() =>
          window.scrollTo({ top: 0, behavior: 'instant' }),
        );
        if (viewport) await page.setViewportSize(viewport);
      }
    });
    await step('discard brings back the saved fields', async () => {
      await page.getByTestId('form-add-field').click();
      await page
        .getByTestId('form-dirty')
        .getByText(ui('ja', 'form.unsaved'))
        .waitFor();
      await page
        .getByRole('button', { name: ui('ja', 'form.discard') })
        .click();
      await page
        .getByTestId('form-field-card')
        .nth(publicForm.fields.length)
        .waitFor({ state: 'detached' });
      // A re-render after the reset must not loop either.
      const first = page.getByTestId('form-field-card').first();
      await first.locator('button[aria-controls$="-settings"]').click();
      await first.getByLabel(ui('ja', 'form.labelJa')).waitFor();
      await first.locator('button[aria-controls$="-settings"]').click();
      const unsaved = await page
        .getByTestId('form-dirty')
        .getByText(ui('ja', 'form.unsaved'))
        .count();
      if (unsaved > 0) throw new Error('still marked as unsaved');
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
  if (E2E_SECRETS === 'app-secret') await checkShortAppSecret();
  console.log(
    failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`,
  );
  process.exit(failures === 0 ? 0 : 1);
};

await main();
