import type { GoodnightEnv } from '../../env.ts';

/** Which settings the contact API needs, and whether each one is present. */
export interface ContactAvailability {
  /** `true` only when every setting below is present. */
  available: boolean;
  turnstileSecret: boolean;
  turnstileSiteKey: boolean;
  ipHashSecret: boolean;
  rateLimiter: boolean;
}

/**
 * Checks the settings the contact API needs. When any is missing the API
 * answers 503 and the form shows that it is not available yet (fail closed).
 */
export const getContactAvailability = (
  env: GoodnightEnv,
): ContactAvailability => {
  const turnstileSecret = Boolean(env.TURNSTILE_SECRET);
  const turnstileSiteKey = Boolean(env.TURNSTILE_SITE_KEY);
  const ipHashSecret = Boolean(env.IP_HASH_SECRET);
  const rateLimiter = typeof env.CONTACT_RATE_LIMITER?.limit === 'function';
  return {
    available:
      turnstileSecret && turnstileSiteKey && ipHashSecret && rateLimiter,
    turnstileSecret,
    turnstileSiteKey,
    ipHashSecret,
    rateLimiter,
  };
};
