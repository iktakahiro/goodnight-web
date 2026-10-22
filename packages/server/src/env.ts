import type { D1Database, Fetcher, RateLimit } from '@cloudflare/workers-types';

/**
 * Bindings and secrets that a goodnight-web Worker reads from `env`.
 *
 * Only `DB` is required for the Worker to start. Each feature checks the
 * settings it needs on every request and turns itself off (fails closed) when
 * one is missing. Secrets are never returned to the browser or written to D1.
 */
export interface GoodnightEnv {
  /** D1 database with the migrations from `@goodnight-web/server/migrations`. */
  DB: D1Database;
  /** Static Assets binding. Requests the Worker does not handle go here. */
  ASSETS?: Fetcher;
  /** Rate Limiting binding for contact submissions and setup attempts. */
  CONTACT_RATE_LIMITER?: RateLimit;
  /** Secret that must be presented to create the first admin. */
  SETUP_TOKEN?: string;
  /** Comma-separated list of addresses that may be admins. */
  ADMIN_EMAILS?: string;
  /** Better Auth signing secret. At least 32 characters. */
  BETTER_AUTH_SECRET?: string;
  /** HMAC key for `ip_hash`. Raw IP addresses are never stored. */
  IP_HASH_SECRET?: string;
  /** Turnstile secret key for server-side verification. */
  TURNSTILE_SECRET?: string;
  /** Turnstile site key (public). The contact form reads it from the API. */
  TURNSTILE_SITE_KEY?: string;
  /** Optional Slack incoming webhook URL for new-inquiry notifications. */
  SLACK_WEBHOOK_URL?: string;
}
