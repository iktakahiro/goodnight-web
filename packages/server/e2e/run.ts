// End-to-end test against `wrangler dev` with local D1 and real Chromium.
//
//   bun run test:e2e
//
// Needs Playwright's Chromium (`bunx playwright install chromium`). Uses port
// 8790 (override with E2E_PORT) and a fresh state directory under
// .wrangler/e2e-state, so it does not touch other local databases.
//
// Covers: contact POST -> row in D1; first-admin setup -> passkey
// registration (CDP virtual authenticator) -> sign-out -> passkey sign-in ->
// admin list, detail, status change, and CSV export through the API.
import { rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright';

const packageDir = resolve(import.meta.dir, '..');
const config = join(packageDir, 'e2e/wrangler.jsonc');
const stateDir = join(packageDir, '.wrangler/e2e-state');
const port = Number(process.env.E2E_PORT ?? '8790');
// WebAuthn rejects IP addresses as the relying party ID: use localhost.
const base = `http://localhost:${port}`;
const wrangler = join(packageDir, 'node_modules/.bin/wrangler');

const SETUP_TOKEN = 'e2e-setup-token-0123456789';
const ADMIN_EMAIL = 'admin@example.com';
const vars = {
  SETUP_TOKEN,
  ADMIN_EMAILS: ADMIN_EMAIL,
  BETTER_AUTH_SECRET: 'e2e-better-auth-secret-0123456789abcdef',
  IP_HASH_SECRET: 'e2e-ip-hash-secret',
  TURNSTILE_SECRET: 'e2e-turnstile-secret',
};

let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (!ok) failures++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${name}${ok || detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`,
  );
};

const run = async (args: string[]) => {
  const proc = Bun.spawn([wrangler, ...args], {
    cwd: packageDir,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0)
    throw new Error(`wrangler ${args.join(' ')} failed:\n${out}\n${err}`);
  return out;
};

const query = async (sql: string): Promise<Record<string, unknown>[]> => {
  const out = await run([
    'd1',
    'execute',
    'DB',
    '--local',
    '-c',
    config,
    '--persist-to',
    stateDir,
    '--json',
    '--command',
    sql,
  ]);
  const parsed = JSON.parse(out) as { results: Record<string, unknown>[] }[];
  return parsed[0]?.results ?? [];
};

const waitForServer = async () => {
  for (let i = 0; i < 120; i++) {
    try {
      const response = await fetch(`${base}/api/contact/config`);
      if (response.ok) return;
    } catch {
      // Not up yet.
    }
    await Bun.sleep(500);
  }
  throw new Error(`wrangler dev did not start on ${base}`);
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
  addPasskey: () => Promise<{ data?: { id?: string } | null; error?: unknown }>;
  signOut: () => Promise<unknown>;
  signInPasskey: () => Promise<{ error?: unknown }>;
};

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
  message: 'Hello from the end-to-end test.',
  consent: true,
  turnstileToken: token,
  elapsedMs: 15_000,
  pagePath: '/contact',
});

const main = async () => {
  const build = await Bun.build({
    entrypoints: [join(packageDir, 'e2e/client/app.ts')],
    outdir: join(packageDir, 'e2e/public'),
    target: 'browser',
    minify: true,
  });
  if (!build.success) throw new Error(build.logs.join('\n'));

  await rm(stateDir, { recursive: true, force: true });
  await run([
    'd1',
    'migrations',
    'apply',
    'DB',
    '--local',
    '-c',
    config,
    '--persist-to',
    stateDir,
  ]);

  const dev = Bun.spawn(
    [
      wrangler,
      'dev',
      '-c',
      config,
      '--port',
      String(port),
      '--ip',
      '127.0.0.1',
      '--persist-to',
      stateDir,
      '--show-interactive-dev-session=false',
      ...Object.entries(vars).flatMap(([k, v]) => ['--var', `${k}:${v}`]),
    ],
    {
      cwd: packageDir,
      stdout: 'ignore',
      stderr: 'inherit',
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    },
  );
  const browser = await chromium.launch({ headless: true });
  try {
    await waitForServer();
    const context = await browser.newContext();
    const page = await context.newPage();
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
    await page.goto(`${base}/`);
    await page.waitForSelector('body[data-ready="true"]');

    // Contact form.
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
      'SELECT name, status, ip_hash, category FROM submissions ORDER BY created_at',
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

    // First admin.
    const before = await gnw(page, 'call', '/api/admin/submissions');
    check('admin list is 401 before sign-in', before.status === 401, before);
    const state = await gnw(page, 'call', '/api/setup');
    check(
      'setup is open',
      (state.body as { open?: boolean }).open === true,
      state,
    );
    const wrong = await gnw(page, 'setup', 'wrong-token', ADMIN_EMAIL, 'Admin');
    check('setup with a wrong token is 403', wrong.status === 403, wrong);
    const notAllowed = await gnw(
      page,
      'setup',
      SETUP_TOKEN,
      'other@example.com',
      'Other',
    );
    check(
      'setup with an address outside ADMIN_EMAILS is 403',
      notAllowed.status === 403,
      notAllowed,
    );
    const created = await gnw(
      page,
      'setup',
      SETUP_TOKEN,
      'Admin@Example.com',
      'Admin',
    );
    check('setup creates the admin', created.status === 200, created);
    const noPasskey = await gnw(page, 'call', '/api/admin/submissions');
    check(
      'admin list needs a passkey first',
      noPasskey.status === 403,
      noPasskey,
    );

    const added = await gnw(page, 'addPasskey');
    check(
      'passkey registration',
      !added.error && Boolean(added.data?.id),
      added.error,
    );
    const { credentials } = await cdp.send('WebAuthn.getCredentials', {
      authenticatorId,
    });
    check(
      'authenticator holds one resident credential',
      credentials.length === 1 && credentials[0]?.isResidentCredential === true,
    );
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

    await gnw(page, 'signOut');
    const signedOut = await gnw(page, 'call', '/api/admin/submissions');
    check(
      'admin list is 401 after sign-out',
      signedOut.status === 401,
      signedOut,
    );

    const signedIn = await gnw(page, 'signInPasskey');
    check('passkey sign-in', !signedIn.error, signedIn.error);

    // Admin API.
    const list = await gnw(page, 'call', '/api/admin/submissions');
    const listBody = list.body as {
      items: { id: string }[];
      unreadCount: number;
    };
    check(
      'admin list shows the submission',
      list.status === 200 &&
        listBody.items.length === 1 &&
        listBody.unreadCount === 1,
      list,
    );
    const id = listBody.items[0]?.id ?? '';
    const detail = await gnw(page, 'call', `/api/admin/submissions/${id}`);
    check(
      'detail marks it read',
      (detail.body as { status?: string }).status === 'read',
      detail,
    );
    const patched = await gnw(page, 'call', `/api/admin/submissions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'done' }),
    });
    check(
      'status change',
      (patched.body as { status?: string }).status === 'done',
      patched,
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
    const admin = await gnw(page, 'call', '/admin/inquiries/abc');
    check(
      'admin UI deep link is served with the CSP',
      admin.status === 200 &&
        (admin.headers['content-security-policy'] ?? '').includes(
          "script-src 'self'",
        ),
      admin.status,
    );
    const sessions = await query('SELECT ipAddress FROM session');
    check(
      'sessions store no IP address',
      sessions.every((s) => !s.ipAddress),
      sessions,
    );
  } finally {
    await browser.close();
    dev.kill();
    await dev.exited;
  }
  console.log(
    failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`,
  );
  process.exit(failures === 0 ? 0 : 1);
};

await main();
