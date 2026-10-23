import { describe, expect, test } from 'bun:test';
import { runSetup } from '../../testing/admin-session.ts';
import {
  CookieJar,
  SoftAuthenticator,
} from '../../testing/soft-authenticator.ts';
import {
  createTestWorker,
  type TestWorker,
} from '../../testing/test-worker.ts';

// The statements of the passkey recovery page
// (apps/docs/src/content/docs/docs/how-it-works/passkey-recovery.mdx), in
// the documented order: passkeys, then sessions, then the setup lock.
const RECOVERY = [
  'DELETE FROM passkey',
  'DELETE FROM session',
  "DELETE FROM settings WHERE key = 'setup_closed_at'",
];

const count = (worker: TestWorker, table: string) =>
  (
    worker.sqlite.query(`SELECT COUNT(*) AS n FROM ${table}`).get() as {
      n: number;
    }
  ).n;

const me = (worker: TestWorker, jar: CookieJar) =>
  worker.fetch('/api/admin/me', { headers: { cookie: jar.header() } });

describe('passkey recovery', () => {
  test('the documented statements reopen setup and lock out the old passkey and sessions', async () => {
    const worker = createTestWorker();
    const oldPasskey = new SoftAuthenticator();
    const setupJar = new CookieJar(await runSetup(worker));
    expect(
      (await oldPasskey.register(worker, setupJar, { createSession: true }))
        .status,
    ).toBe(200);
    const signedIn = new CookieJar();
    expect((await oldPasskey.signIn(worker, signedIn)).status).toBe(200);
    expect((await me(worker, signedIn)).status).toBe(200);

    for (const statement of RECOVERY) worker.sqlite.exec(statement);
    expect(count(worker, 'passkey')).toBe(0);
    expect(count(worker, 'session')).toBe(0);

    expect(await (await worker.fetch('/api/setup')).json()).toMatchObject({
      open: true,
    });
    expect((await me(worker, signedIn)).status).toBe(401);
    expect((await oldPasskey.signIn(worker, new CookieJar())).status).not.toBe(
      200,
    );

    const newPasskey = new SoftAuthenticator();
    const again = new CookieJar(await runSetup(worker));
    expect(
      (await newPasskey.register(worker, again, { createSession: true }))
        .status,
    ).toBe(200);
    expect((await me(worker, again)).status).toBe(200);
    expect(await (await worker.fetch('/api/setup')).json()).toMatchObject({
      open: false,
    });
  });

  test('once the passkeys are gone, no new session can appear before setup opens', async () => {
    const worker = createTestWorker();
    const oldPasskey = new SoftAuthenticator();
    const setupJar = new CookieJar(await runSetup(worker));
    await oldPasskey.register(worker, setupJar, { createSession: true });
    worker.sqlite.exec(String(RECOVERY[0]));
    // Between the first and second statement: the old passkey cannot sign
    // in, and setup is still closed.
    expect((await oldPasskey.signIn(worker, new CookieJar())).status).not.toBe(
      200,
    );
    const closed = await worker.fetch('/api/setup');
    expect(await closed.json()).toMatchObject({ open: false });
  });
});
