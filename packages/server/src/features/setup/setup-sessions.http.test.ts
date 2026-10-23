import { describe, expect, test } from 'bun:test';
import {
  insertPasskey,
  passkeySignIn,
  runSetup,
  signInAsAdmin,
} from '../../testing/admin-session.ts';
import {
  CookieJar,
  SoftAuthenticator,
} from '../../testing/soft-authenticator.ts';
import {
  createTestWorker,
  type TestWorker,
} from '../../testing/test-worker.ts';

const me = (worker: TestWorker, cookie: string) =>
  worker.fetch('/api/admin/me', { headers: { cookie } });

const hasSession = async (worker: TestWorker, cookie: string) =>
  (await (
    await worker.fetch('/api/auth/get-session', { headers: { cookie } })
  ).json()) !== null;

const count = (worker: TestWorker, table: string) =>
  (
    worker.sqlite.query(`SELECT COUNT(*) AS n FROM ${table}`).get() as {
      n: number;
    }
  ).n;

describe('sessions around setup and the first passkey', () => {
  test('the full flow: setup, first passkey, passkey sign-in', async () => {
    const worker = createTestWorker();
    const jar = new CookieJar(await runSetup(worker));
    const setupCookie = jar.header();
    expect((await me(worker, setupCookie)).status).toBe(403);

    const authenticator = new SoftAuthenticator();
    const registered = await authenticator.register(worker, jar, {
      createSession: true,
    });
    expect(registered.status).toBe(200);
    expect(count(worker, 'passkey')).toBe(1);
    // The session from setup is gone; the registration created a new one.
    expect(await hasSession(worker, setupCookie)).toBe(false);
    expect((await me(worker, setupCookie)).status).toBe(401);
    expect(jar.header()).not.toBe(setupCookie);
    expect((await me(worker, jar.header())).status).toBe(200);

    const signedIn = new CookieJar();
    expect((await authenticator.signIn(worker, signedIn)).status).toBe(200);
    expect((await me(worker, signedIn.header())).status).toBe(200);
  });

  test('registering the first passkey without createSession signs out', async () => {
    const worker = createTestWorker();
    const jar = new CookieJar(await runSetup(worker));
    const authenticator = new SoftAuthenticator();
    expect((await authenticator.register(worker, jar)).status).toBe(200);
    expect(count(worker, 'session')).toBe(0);
    expect((await me(worker, jar.header())).status).toBe(401);
  });

  test('an earlier setup session is revoked when setup runs again (audit F1)', async () => {
    const worker = createTestWorker();
    const s1 = await runSetup(worker);
    const s2 = await runSetup(worker);
    expect(await hasSession(worker, s1)).toBe(false);
    expect(await hasSession(worker, s2)).toBe(true);

    const jar = new CookieJar(s2);
    await new SoftAuthenticator().register(worker, jar, {
      createSession: true,
    });
    expect((await worker.fetch('/api/setup')).status).toBe(200);
    expect((await (await worker.fetch('/api/setup')).json()).open).toBe(false);
    expect((await me(worker, s1)).status).toBe(401);
    expect((await me(worker, jar.header())).status).toBe(200);
  });

  test('the first passkey revokes setup sessions of every user', async () => {
    const worker = createTestWorker();
    const second = await runSetup(worker, 'second@example.com');
    const jar = new CookieJar(await runSetup(worker));
    await new SoftAuthenticator().register(worker, jar, {
      createSession: true,
    });
    expect(await hasSession(worker, second)).toBe(false);
    const options = await worker.fetch(
      '/api/auth/passkey/generate-register-options',
      { headers: { cookie: second } },
    );
    expect(options.status).toBe(401);
  });

  test('after setup closes, a user without a passkey cannot register one', async () => {
    const worker = createTestWorker();
    await runSetup(worker, 'second@example.com');
    await signInAsAdmin(worker);
    // Even with a valid session (here made directly), the second address
    // cannot become an admin once setup is closed.
    const { id } = worker.sqlite
      .query("SELECT id FROM user WHERE email = 'second@example.com'")
      .get() as { id: string };
    const jar = new CookieJar(await passkeySignIn(worker, id));
    const response = await new SoftAuthenticator().register(worker, jar);
    expect(response.status).toBe(403);
    expect(
      worker.sqlite
        .query('SELECT COUNT(*) AS n FROM passkey WHERE user_id = ?1')
        .get(id),
    ).toEqual({ n: 0 });
  });

  test('an admin can add another passkey and keeps the session', async () => {
    const worker = createTestWorker();
    const jar = new CookieJar(await runSetup(worker));
    const authenticator = new SoftAuthenticator();
    await authenticator.register(worker, jar, { createSession: true });
    const cookie = jar.header();
    expect((await authenticator.register(worker, jar)).status).toBe(200);
    expect(count(worker, 'passkey')).toBe(2);
    expect((await me(worker, cookie)).status).toBe(200);
  });

  test('an address removed from ADMIN_EMAILS cannot add a passkey', async () => {
    const worker = createTestWorker();
    const jar = new CookieJar(await runSetup(worker));
    const authenticator = new SoftAuthenticator();
    await authenticator.register(worker, jar, { createSession: true });
    expect(count(worker, 'passkey')).toBe(1);
    // The owner removes the address. The session is still valid until the
    // next admin request purges it.
    worker.env.ADMIN_EMAILS = 'someone-else@example.com';
    const response = await authenticator.register(worker, jar);
    expect(response.status).toBe(403);
    expect(count(worker, 'passkey')).toBe(1);
  });

  test('requireAdmin rejects a session older than the first passkey', async () => {
    // Defense in depth: even if a session from setup was not deleted (here
    // the passkey row is inserted without the registration hook), it never
    // becomes an admin session.
    const worker = createTestWorker();
    const setupCookie = await runSetup(worker);
    await Bun.sleep(2);
    const userId = insertPasskey(worker);
    expect(await hasSession(worker, setupCookie)).toBe(true);
    const response = await me(worker, setupCookie);
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('unauthorized');
    expect((await me(worker, await passkeySignIn(worker, userId))).status).toBe(
      200,
    );
  });
});
