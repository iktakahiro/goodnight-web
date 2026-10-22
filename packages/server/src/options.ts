import type { Locale } from './shared/messages.ts';

/**
 * Options for {@link createGoodnightWorker}. Everything is optional; secrets
 * and bindings come from `env`, not from here.
 */
export interface GoodnightWorkerOptions {
  /**
   * Language for Slack notifications and for API messages when the request's
   * `Accept-Language` matches neither `ja` nor `en`. Defaults to `en`.
   */
  locale?: Locale;
  /** Contact API settings. */
  contact?: {
    /**
     * Allowed values of the `category` field. When set, any other value is
     * rejected. Slack notifications show the category only when it is in this
     * list, so free text never reaches Slack.
     */
    categories?: readonly string[];
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
  contact: {
    categories: readonly string[] | undefined;
    turnstileHostnames: readonly string[] | undefined;
  };
}

/** Applies defaults to {@link GoodnightWorkerOptions}. */
export const resolveOptions = (
  options: GoodnightWorkerOptions = {},
): ResolvedOptions => ({
  locale: options.locale ?? 'en',
  contact: {
    categories: options.contact?.categories,
    turnstileHostnames: options.contact?.turnstileHostnames,
  },
});
