import { describe, expect, test } from 'bun:test';
import { insertPasskey, runSetup } from '../../testing/admin-session.ts';
import { captureConsole } from '../../testing/console-capture.ts';
import {
  CookieJar,
  SoftAuthenticator,
} from '../../testing/soft-authenticator.ts';
import {
  createTestWorker,
  ORIGIN,
  SECRETS,
  type TestWorker,
} from '../../testing/test-worker.ts';
import { claimSetup, releaseSetupClaim } from './setup-state.ts';

// Statements to pause at. The claim is the only insert into `settings` during
// a registration; Better Auth inserts sessions and passkeys itself.
const CLAIM = /^insert into "settings"/i;
const SESSION_INSERT = /^insert into "session"/i;
const PASSKEY_INSERT = /^insert into "passkey"/i;

const me = (worker: TestWorker, cookie: string) =>
  worker.fetch('/api/admin/me', { headers: { cookie } });

const setupRequest = (worker: TestWorker, email: string) =>
  worker.fetch('/api/setup', {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify({ token: SECRETS.SETUP_TOKEN, email, name: 'Admin' }),
  });

const isOpen = async (worker: TestWorker) =>
  ((await (await worker.fetch('/api/setup')).json()) as { open: boolean }).open;

const count = (worker: TestWorker, table: string) =>
  (
    worker.sqlite.query(`SELECT COUNT(*) AS n FROM ${table}`).get() as {
      n: number;
    }
  ).n;

const errorCode = async (response: Response) =>
  ((await response.json()) as { error: { code: string } }).error.code;

/** Every stored session that passes `requireAdmin`. */
const adminSessionCount = async (worker: TestWorker, cookies: string[]) => {
  let n = 0;
  for (const cookie of cookies) {
    if ((await me(worker, cookie)).status === 200) n += 1;
  }
  return n;
};

describe('setup races (docs/decisions/0006)', () => {
  test('of two overlapping first-passkey registrations, only one claims setup', async () => {
    const worker = createTestWorker();
    const jarA = new CookieJar(await runSetup(worker, 'admin@example.com'));
    const jarB = new CookieJar(await runSetup(worker, 'second@example.com'));
    const pauseA = worker.pauseAt(CLAIM);
    const pauseB = worker.pauseAt(CLAIM);

    const registrationA = new SoftAuthenticator().register(worker, jarA, {
      createSession: true,
    });
    await pauseA.reached;
    const registrationB = new SoftAuthenticator().register(worker, jarB, {
      createSession: true,
    });
    // Both registrations have verified their passkey and seen setup open.
    await pauseB.reached;
    pauseA.release();
    pauseB.release();
    const [a, b] = await Promise.all([registrationA, registrationB]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(403);
    expect(count(worker, 'passkey')).toBe(1);
    expect(
      worker.sqlite
        .query(`SELECT u.email FROM passkey p JOIN user u ON u.id = p.user_id`)
        .all(),
    ).toEqual([{ email: 'admin@example.com' }]);
    expect(count(worker, 'session')).toBe(1);
    expect((await me(worker, jarA.header())).status).toBe(200);
    expect((await me(worker, jarB.header())).status).toBe(401);
    expect(await isOpen(worker)).toBe(false);
  });

  test('a setup request that creates its session after the first passkey gets no session', async () => {
    const worker = createTestWorker();
    const jar = new CookieJar(await runSetup(worker));
    const claimPause = worker.pauseAt(CLAIM);
    const registration = new SoftAuthenticator().register(worker, jar, {
      createSession: true,
    });
    await claimPause.reached;

    // Setup for the same address passes every check while setup is open,
    // then waits before it inserts its session.
    const sessionPause = worker.pauseAt(SESSION_INSERT);
    const setup = setupRequest(worker, 'admin@example.com');
    await sessionPause.reached;

    claimPause.release();
    expect((await registration).status).toBe(200);
    // The passkey exists now; the setup session would be newer than it.
    sessionPause.release();
    const response = await setup;
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe('setup_closed');
    expect(response.headers.getSetCookie()).toEqual([]);

    expect(count(worker, 'session')).toBe(1);
    expect((await me(worker, jar.header())).status).toBe(200);
  });

  test('a setup request between the claim and the passkey insert gets no session', async () => {
    const worker = createTestWorker();
    const jar = new CookieJar(await runSetup(worker));
    const sessionPause = worker.pauseAt(SESSION_INSERT);
    const setup = setupRequest(worker, 'second@example.com');
    await sessionPause.reached;

    const passkeyPause = worker.pauseAt(PASSKEY_INSERT);
    const registration = new SoftAuthenticator().register(worker, jar, {
      createSession: true,
    });
    // The registration has claimed setup and deleted every session.
    await passkeyPause.reached;
    expect(count(worker, 'session')).toBe(0);

    sessionPause.release();
    const response = await setup;
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe('setup_closed');
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(count(worker, 'session')).toBe(0);

    passkeyPause.release();
    expect((await registration).status).toBe(200);
    const sessions = worker.sqlite.query('SELECT token FROM session').all() as {
      token: string;
    }[];
    expect(sessions).toHaveLength(1);
    expect(await adminSessionCount(worker, [jar.header()])).toBe(1);
  });

  test('a session older than the first passkey cannot add a passkey', async () => {
    // A setup session that outlived the first passkey (here the passkey row
    // is inserted without the registration hook) must not get a passkey or
    // a fresh session from registering another one.
    const worker = createTestWorker();
    const setupCookie = await runSetup(worker);
    await Bun.sleep(2);
    insertPasskey(worker);
    const jar = new CookieJar(setupCookie);
    const response = await new SoftAuthenticator().register(worker, jar, {
      createSession: true,
    });
    expect(response.status).toBe(401);
    expect(count(worker, 'passkey')).toBe(1);
    expect(count(worker, 'session')).toBe(1);
    expect((await me(worker, jar.header())).status).toBe(401);
  });

  test('a failed passkey insert releases the claim, so the owner can retry', async () => {
    const worker = createTestWorker();
    const jar = new CookieJar(await runSetup(worker));
    const passkeyPause = worker.pauseAt(PASSKEY_INSERT);
    const logs = captureConsole();
    try {
      const registration = new SoftAuthenticator().register(worker, jar, {
        createSession: true,
      });
      await passkeyPause.reached;
      expect(await isOpen(worker)).toBe(false);
      passkeyPause.release(new Error('D1_ERROR: simulated failure'));
      expect((await registration).status).toBe(500);
    } finally {
      logs.restore();
    }
    expect(count(worker, 'passkey')).toBe(0);
    expect(await isOpen(worker)).toBe(true);

    const retry = new CookieJar(await runSetup(worker));
    expect(
      (
        await new SoftAuthenticator().register(worker, retry, {
          createSession: true,
        })
      ).status,
    ).toBe(200);
    expect((await me(worker, retry.header())).status).toBe(200);
    expect(await isOpen(worker)).toBe(false);
  });
});

describe('claimSetup and releaseSetupClaim', () => {
  test('only one claim succeeds', async () => {
    const worker = createTestWorker();
    const claims = await Promise.all([
      claimSetup(worker.env.DB),
      claimSetup(worker.env.DB),
      claimSetup(worker.env.DB),
    ]);
    expect(claims.filter((claim) => claim !== null)).toHaveLength(1);
    expect(await isOpen(worker)).toBe(false);
  });

  test('a release reopens setup only for its own claim and without a passkey', async () => {
    const worker = createTestWorker();
    await runSetup(worker);
    const claim = await claimSetup(worker.env.DB);
    if (claim === null) throw new Error('claim failed');

    await releaseSetupClaim(worker.env.DB, `${claim}0`);
    expect(await isOpen(worker)).toBe(false);

    insertPasskey(worker);
    await releaseSetupClaim(worker.env.DB, claim);
    worker.sqlite.query('DELETE FROM passkey').run();
    // The settings row stayed, so setup stays closed without passkeys.
    expect(await isOpen(worker)).toBe(false);
  });

  test('a release without a passkey reopens setup', async () => {
    const worker = createTestWorker();
    const claim = await claimSetup(worker.env.DB);
    if (claim === null) throw new Error('claim failed');
    expect(await isOpen(worker)).toBe(false);
    await releaseSetupClaim(worker.env.DB, claim);
    expect(await isOpen(worker)).toBe(true);
  });
});
