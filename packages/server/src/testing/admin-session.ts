import { getAuth } from '../features/auth/auth.ts';
import { ORIGIN, SECRETS, type TestWorker } from './test-worker.ts';

/** Name of Better Auth's session cookie on an https origin. */
export const SESSION_COOKIE = '__Secure-better-auth.session_token';

/** Runs `POST /api/setup` and returns its session cookie. */
export const runSetup = async (
  worker: TestWorker,
  email = 'admin@example.com',
): Promise<string> => {
  const response = await worker.fetch('/api/setup', {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify({ token: SECRETS.SETUP_TOKEN, email, name: 'Admin' }),
  });
  if (response.status !== 200) {
    throw new Error(
      `setup failed: ${response.status} ${await response.text()}`,
    );
  }
  return response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
};

/** Inserts a passkey row for the user, as passkey registration would. */
export const insertPasskey = (
  worker: TestWorker,
  email = 'admin@example.com',
): string => {
  const user = worker.sqlite
    .query('SELECT id FROM user WHERE email = ?1')
    .get(email.toLowerCase()) as { id: string };
  worker.sqlite
    .query(
      `INSERT INTO passkey (id, name, public_key, user_id, credential_id,
        counter, device_type, backed_up, transports, created_at)
      VALUES (?1, 'test', 'pk', ?2, ?3, 0, 'singleDevice', 0, 'internal', ?4)`,
    )
    .run(crypto.randomUUID(), user.id, crypto.randomUUID(), Date.now());
  return user.id;
};

/** HMAC-SHA256 signature of a cookie value, as Better Call signs it. */
const signCookieValue = async (value: string, secret: string) => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)),
  );
  return encodeURIComponent(
    `${value}.${btoa(String.fromCharCode(...signature))}`,
  );
};

/**
 * Creates a session for the user and returns its cookie, as a passkey
 * sign-in would. Tests cannot run a WebAuthn ceremony, so this stands in for
 * `POST /api/auth/passkey/verify-authentication`.
 */
export const passkeySignIn = async (
  worker: TestWorker,
  userId: string,
): Promise<string> => {
  const context = await getAuth(worker.env, ORIGIN).$context;
  const session = await context.internalAdapter.createSession(userId);
  const value = await signCookieValue(
    session.token,
    SECRETS.BETTER_AUTH_SECRET,
  );
  return `${SESSION_COOKIE}=${value}`;
};

/**
 * Runs first-admin setup and returns a session cookie. With `passkey` (the
 * default), also inserts a passkey row and returns the cookie of a session
 * created after it, as passkey registration and sign-in would. Without it,
 * returns the session from setup, which has no passkey.
 */
export const signInAsAdmin = async (
  worker: TestWorker,
  { email = 'admin@example.com', passkey = true } = {},
): Promise<string> => {
  const setupCookie = await runSetup(worker, email);
  if (!passkey) return setupCookie;
  return passkeySignIn(worker, insertPasskey(worker, email));
};
