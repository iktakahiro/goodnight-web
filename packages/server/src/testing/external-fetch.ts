import { spyOn } from 'bun:test';
import { TURNSTILE_SITEVERIFY_URL } from '../features/contact/turnstile.ts';

/** A request the Worker sent to an external service. */
export interface ExternalCall {
  url: string;
  body: string;
  form: FormData | null;
  /** The `redirect` option the call was made with. */
  redirect?: RequestRedirect | undefined;
}

/** Siteverify result for a valid token on `example.com` with action `contact`. */
export const TURNSTILE_OK = {
  success: true,
  hostname: 'example.com',
  action: 'contact',
  'error-codes': [],
};

/**
 * Replaces `fetch` with stubs for Turnstile siteverify and Slack. Any other
 * URL fails the test. Call `restore()` after the test.
 */
export const mockExternalFetch = ({
  turnstile = () => TURNSTILE_OK,
  slack = () => new Response('ok'),
}: {
  turnstile?: (form: FormData) => unknown;
  slack?: (body: string) => Response;
} = {}) => {
  const calls: ExternalCall[] = [];
  const spy = spyOn(globalThis, 'fetch').mockImplementation((async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = input instanceof Request ? input.url : String(input);
    const body = init?.body;
    if (url === TURNSTILE_SITEVERIFY_URL) {
      const form = body instanceof FormData ? body : new FormData();
      calls.push({ url, body: '', form });
      return Response.json(turnstile(form));
    }
    if (url.startsWith('https://hooks.slack.com/')) {
      const text = typeof body === 'string' ? body : '';
      calls.push({ url, body: text, form: null, redirect: init?.redirect });
      return slack(text);
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch);
  return {
    calls,
    turnstileCalls: () =>
      calls.filter((c) => c.url === TURNSTILE_SITEVERIFY_URL),
    slackCalls: () =>
      calls.filter((c) => c.url.startsWith('https://hooks.slack.com/')),
    restore: () => spy.mockRestore(),
  };
};
