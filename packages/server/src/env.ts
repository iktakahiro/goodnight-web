import type { D1Database, Fetcher, RateLimit } from '@cloudflare/workers-types';

/**
 * Bindings and secrets that a goodnight-web Worker reads from `env`.
 *
 * Only `DB` is required for the Worker to start. Each feature checks the
 * settings it needs on every request and turns itself off (fails closed) when
 * one is missing. Secrets are never returned to the browser or written to D1.
 *
 * `APP_SECRET` can stand in for `SETUP_TOKEN`, `BETTER_AUTH_SECRET`, and
 * `IP_HASH_SECRET`, so a site needs only `APP_SECRET` and `ADMIN_EMAILS`.
 * The Worker resolves this once per request, before any route runs, and
 * every route reads the resolved values (docs/decisions/0010).
 */
export interface GoodnightEnv {
  /** D1 database with the migrations from `@goodnight-web/server/migrations`. */
  DB: D1Database;
  /** Static Assets binding. Requests the Worker does not handle go here. */
  ASSETS?: Fetcher;
  /** Rate Limiting binding for contact submissions and setup attempts. */
  CONTACT_RATE_LIMITER?: RateLimit;
  /**
   * Root secret of the site. At least 32 characters. When `BETTER_AUTH_SECRET`
   * or `IP_HASH_SECRET` is unset or empty, its key is derived from this value
   * with HKDF-SHA-256 and a fixed label per purpose. When `SETUP_TOKEN` is
   * unset or empty, this value is the setup token. Keep it after setup:
   * changing or removing it signs every admin out and changes IP hashes.
   */
  APP_SECRET?: string;
  /**
   * Secret that must be presented to create the first admin. At least 32
   * characters. Optional when `APP_SECRET` is set: without it, setup accepts
   * `APP_SECRET`. When set, only this value is accepted.
   */
  SETUP_TOKEN?: string;
  /** Comma-separated list of addresses that may be admins. */
  ADMIN_EMAILS?: string;
  /**
   * Better Auth signing secret. At least 32 characters. Optional when
   * `APP_SECRET` is set: without it, the key is derived from `APP_SECRET`.
   * When set, it is used instead, and a value that is too short keeps sign-in
   * off.
   */
  BETTER_AUTH_SECRET?: string;
  /**
   * HMAC key for `ip_hash`. At least 32 characters. Raw IP addresses are
   * never stored. Optional when `APP_SECRET` is set: without it, the key is
   * derived from `APP_SECRET`. When set, it is used instead, and a value that
   * is too short keeps the contact API and setup off.
   */
  IP_HASH_SECRET?: string;
  /** Turnstile secret key for server-side verification. */
  TURNSTILE_SECRET?: string;
  /** Turnstile site key (public). The contact form reads it from the API. */
  TURNSTILE_SITE_KEY?: string;
  /** Optional Slack incoming webhook URL for new-inquiry notifications. */
  SLACK_WEBHOOK_URL?: string;
  /**
   * Optional Cloudflare Access application audience (AUD) tag. With
   * `ACCESS_TEAM_DOMAIN`, the Worker verifies the `Cf-Access-Jwt-Assertion`
   * header on the admin UI, the admin API, setup, and Better Auth. Several
   * tags may be given, separated by commas.
   */
  ACCESS_AUD?: string;
  /**
   * Optional Cloudflare Access team domain, such as
   * `your-team.cloudflareaccess.com`. Set it together with `ACCESS_AUD`.
   */
  ACCESS_TEAM_DOMAIN?: string;
}
