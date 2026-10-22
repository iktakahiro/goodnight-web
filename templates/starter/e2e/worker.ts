// Worker for the end-to-end test (npm run test:e2e) only. Never deploy it.
//
// Cloudflare's Turnstile test secret key accepts every token, but siteverify
// then answers with `hostname: "example.com"` and no `action`. The real check
// in @goodnight-web/server rejects that answer, so a submission with test keys
// fails against src/worker.ts (the end-to-end test checks this too). This
// wrapper forwards siteverify to Cloudflare and, only for answers marked
// `metadata.result_with_testing_key`, sets `hostname` and `action` to what a
// real key for this site returns. The production check is unchanged.
import { CONTACT_TURNSTILE_ACTION } from '@goodnight-web/server/contact';
import worker from '../src/worker';

const SITEVERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

let requestHostname = 'localhost';

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : String(input);
  const response = await realFetch(input, init);
  if (url !== SITEVERIFY_URL) return response;
  const body: unknown = await response.json();
  const testKeyAnswer =
    typeof body === 'object' &&
    body !== null &&
    'metadata' in body &&
    typeof body.metadata === 'object' &&
    body.metadata !== null &&
    'result_with_testing_key' in body.metadata &&
    body.metadata.result_with_testing_key === true;
  return Response.json(
    testKeyAnswer
      ? { ...body, hostname: requestHostname, action: CONTACT_TURNSTILE_ACTION }
      : body,
    { status: response.status },
  );
}) as typeof fetch;

export default {
  fetch(...args: Parameters<typeof worker.fetch>) {
    requestHostname = new URL(args[0].url).hostname;
    return worker.fetch(...args);
  },
};
