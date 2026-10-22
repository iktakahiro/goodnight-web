import { ORIGIN, SECRETS, type TestWorker } from './test-worker.ts';

/**
 * Runs first-admin setup and returns the session cookie. With `passkey`, also
 * inserts a passkey row for the user, as passkey registration would.
 */
export const signInAsAdmin = async (
  worker: TestWorker,
  { email = 'admin@example.com', passkey = true } = {},
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
  const cookie = response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  if (passkey) {
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
  }
  return cookie;
};
