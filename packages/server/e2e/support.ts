// Helpers shared by the end-to-end test (run.ts) and the screenshot script
// (screenshots.ts): local D1, `wrangler dev`, and a WebAuthn virtual
// authenticator. Local only; nothing here talks to a Cloudflare account.
import { rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { BrowserContext, Page } from 'playwright';

export const packageDir = resolve(import.meta.dir, '..');
export const wranglerConfig = join(packageDir, 'e2e/wrangler.jsonc');
const wrangler = join(packageDir, 'node_modules/.bin/wrangler');

/** Secrets for the test Worker. Test values only. */
export const SETUP_TOKEN = 'e2e-setup-token-0123456789';
export const ADMIN_EMAIL = 'admin@example.com';
export const testVars: Readonly<Record<string, string>> = {
  SETUP_TOKEN,
  ADMIN_EMAILS: ADMIN_EMAIL,
  BETTER_AUTH_SECRET: 'e2e-better-auth-secret-0123456789abcdef',
  IP_HASH_SECRET: 'e2e-ip-hash-secret',
  TURNSTILE_SECRET: 'e2e-turnstile-secret',
};

/** Runs a wrangler command in the package and returns its stdout. */
export const runWrangler = async (args: string[]): Promise<string> => {
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
  if (code !== 0) {
    throw new Error(`wrangler ${args.join(' ')} failed:\n${out}\n${err}`);
  }
  return out;
};

/** Runs `bun run build` so the Worker embeds the current admin UI. */
export const buildPackage = async (): Promise<void> => {
  const proc = Bun.spawn(['bun', 'run', 'build'], {
    cwd: packageDir,
    stdout: 'ignore',
    stderr: 'inherit',
  });
  if ((await proc.exited) !== 0) throw new Error('bun run build failed');
};

/** A fresh local D1 state directory with the migrations applied. */
export const freshDatabase = async (stateDir: string): Promise<void> => {
  await rm(stateDir, { recursive: true, force: true });
  await runWrangler([
    'd1',
    'migrations',
    'apply',
    'DB',
    '--local',
    '-c',
    wranglerConfig,
    '--persist-to',
    stateDir,
  ]);
};

/** Runs SQL against the local D1 and returns the rows. */
export const queryDatabase = async (
  stateDir: string,
  sql: string,
): Promise<Record<string, unknown>[]> => {
  const out = await runWrangler([
    'd1',
    'execute',
    'DB',
    '--local',
    '-c',
    wranglerConfig,
    '--persist-to',
    stateDir,
    '--json',
    '--command',
    sql,
  ]);
  const parsed = JSON.parse(out) as { results: Record<string, unknown>[] }[];
  return parsed[0]?.results ?? [];
};

/**
 * Starts `wrangler dev` with the test Worker and waits until it answers.
 * Use `localhost`, not an IP address: WebAuthn rejects IP addresses as the
 * relying party ID.
 */
export const startDevServer = async ({
  port,
  stateDir,
  vars,
}: {
  port: number;
  stateDir: string;
  vars: Readonly<Record<string, string>>;
}): Promise<{ base: string; stop: () => Promise<void> }> => {
  const base = `http://localhost:${port}`;
  const dev = Bun.spawn(
    [
      wrangler,
      'dev',
      '-c',
      wranglerConfig,
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
  const stop = async () => {
    dev.kill();
    await dev.exited;
  };
  for (let i = 0; i < 120; i++) {
    try {
      const response = await fetch(`${base}/api/contact/config`);
      if (response.ok) return { base, stop };
    } catch {
      // Not up yet.
    }
    await Bun.sleep(500);
  }
  await stop();
  throw new Error(`wrangler dev did not start on ${base}`);
};

/**
 * Adds a CTAP2 platform authenticator with resident keys and user
 * verification to the page, so passkey prompts complete without a person.
 */
export const addVirtualAuthenticator = async (
  context: BrowserContext,
  page: Page,
) => {
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
  return {
    credentials: async () =>
      (await cdp.send('WebAuthn.getCredentials', { authenticatorId }))
        .credentials,
  };
};
