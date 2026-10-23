import type { Locale } from './shared/messages.ts';

/**
 * Options for {@link createGoodnightWorker}. Everything is optional; secrets
 * and bindings come from `env`, not from here. The contact form fields are
 * not set here: admins edit them in the admin UI, and they are stored in D1.
 */
export interface GoodnightWorkerOptions {
  /**
   * Language for Slack notifications, for CSV headers when none is asked
   * for, and for API messages when the request's `Accept-Language` matches
   * neither `ja` nor `en`. Defaults to `en`.
   */
  locale?: Locale;
  /**
   * The site name shown in Slack notifications, such as `My Company`.
   * Defaults to the hostname of the request (`example.com`). An empty or
   * blank value counts as not set. Slack shows it as plain text, cut to 80
   * characters.
   */
  siteName?: string;
  /** Contact API settings. */
  contact?: {
    /**
     * Hostnames accepted in the Turnstile siteverify result. Defaults to the
     * hostname of the request.
     */
    turnstileHostnames?: readonly string[];
  };
}

/** Options with defaults applied. */
export interface ResolvedOptions {
  locale: Locale;
  /** Trimmed; `undefined` when not set or blank. */
  siteName: string | undefined;
  contact: {
    turnstileHostnames: readonly string[] | undefined;
  };
}

/** Applies defaults to {@link GoodnightWorkerOptions}. */
export const resolveOptions = (
  options: GoodnightWorkerOptions = {},
): ResolvedOptions => ({
  locale: options.locale ?? 'en',
  siteName: options.siteName?.trim() || undefined,
  contact: {
    turnstileHostnames: options.contact?.turnstileHostnames,
  },
});
