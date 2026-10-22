// Browser side of the end-to-end test: exposes window.gnw for Playwright.
import { passkeyClient } from '@better-auth/passkey/client';
import { createAuthClient } from 'better-auth/client';
import { submitContact } from '../../src/client.ts';

const auth = createAuthClient({
  basePath: '/api/auth',
  plugins: [passkeyClient()],
});

const call = async (path: string, init: RequestInit = {}) => {
  const response = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Keep text bodies such as CSV.
  }
  return {
    status: response.status,
    body,
    headers: Object.fromEntries(response.headers),
  };
};

const gnw = {
  call,
  submitContact,
  setup: (token: string, email: string, name: string) =>
    call('/api/setup', {
      method: 'POST',
      body: JSON.stringify({ token, email, name }),
    }),
  addPasskey: () => auth.passkey.addPasskey({ name: 'e2e key' }),
  signOut: () => auth.signOut(),
  signInPasskey: () => auth.signIn.passkey(),
};

(window as unknown as { gnw: typeof gnw }).gnw = gnw;
document.body.dataset.ready = 'true';
