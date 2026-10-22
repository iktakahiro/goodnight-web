/** Cloudflare Turnstile siteverify endpoint. */
export const TURNSTILE_SITEVERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** What the server expects from a Turnstile token. */
export interface TurnstileExpectation {
  secret: string;
  token: string;
  /** Visitor IP. Sent to Turnstile only; never stored or logged. */
  remoteIp: string | undefined;
  hostnames: readonly string[];
  action: string;
}

/** Why a token was rejected, or `ok`. */
export type TurnstileResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'request_failed'
        | 'not_success'
        | 'hostname_mismatch'
        | 'action_mismatch';
    };

/**
 * Verifies a Turnstile token with siteverify and checks that `hostname` and
 * `action` in the result match what this site expects.
 *
 * Any network error, non-200 response, or unexpected body counts as a
 * failure.
 */
export const verifyTurnstile = async (
  expected: TurnstileExpectation,
): Promise<TurnstileResult> => {
  const form = new FormData();
  form.set('secret', expected.secret);
  form.set('response', expected.token);
  if (expected.remoteIp) form.set('remoteip', expected.remoteIp);
  form.set('idempotency_key', crypto.randomUUID());
  let body: unknown;
  try {
    const response = await fetch(TURNSTILE_SITEVERIFY_URL, {
      method: 'POST',
      body: form,
    });
    if (!response.ok) return { ok: false, reason: 'request_failed' };
    body = await response.json();
  } catch {
    return { ok: false, reason: 'request_failed' };
  }
  if (typeof body !== 'object' || body === null) {
    return { ok: false, reason: 'request_failed' };
  }
  const result = body as Record<string, unknown>;
  if (result.success !== true) return { ok: false, reason: 'not_success' };
  if (
    typeof result.hostname !== 'string' ||
    !expected.hostnames.includes(result.hostname)
  ) {
    return { ok: false, reason: 'hostname_mismatch' };
  }
  if (result.action !== expected.action) {
    return { ok: false, reason: 'action_mismatch' };
  }
  return { ok: true };
};
