// Test Worker for the end-to-end test. It is the same as a site's
// src/worker.ts, plus a stub for Turnstile siteverify so the test does not
// call Cloudflare: the token "e2e-pass" passes for this host and the
// "contact" action, and any other token fails.
import { createGoodnightWorker } from '../src/index.ts';
import { TURNSTILE_SITEVERIFY_URL } from '../src/features/contact/turnstile.ts';

const realFetch = globalThis.fetch;
globalThis.fetch = (async (
  input: string | URL | Request,
  init?: RequestInit,
) => {
  const url = input instanceof Request ? input.url : String(input);
  if (url === TURNSTILE_SITEVERIFY_URL && init?.body instanceof FormData) {
    const pass = init.body.get('response') === 'e2e-pass';
    return Response.json({
      success: pass,
      hostname: 'localhost',
      action: 'contact',
      'error-codes': pass ? [] : ['invalid-input-response'],
    });
  }
  return realFetch(input, init);
}) as typeof fetch;

export default createGoodnightWorker({ locale: 'en' });
